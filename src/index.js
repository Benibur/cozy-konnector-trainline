// 'use strict'

/* ===================================================
The goal of this connector is to fetch bills from the
service trainline.fr

Here is the structure of the API's answer :
  body = {
    proofs:           [],
    pnrs:             [],
    folders:          [],
    trips:            [],
    segments:         [],
    after_sales_logs: []
  }

Hints to understand the way to retrive data:
  . the "proofs" are not unique : different proofs can
    point to a identical invoice (pdf). That"s why we
    use the pdf url as the identifier do deduplicate
    invoices.
  . proof.url = link to the pdf of the invoice
  . the real amount of the invoice is nowhere in the
    API's data. The reason it that in case of a ticken
    change with a different price, only the initial
    price will be in the API, not the refund nor the
    extra.
    => we have to parse the pdf to get the real amount
  . pnrs = itinerary and personal information for a
    passenger or a group of passengers travelling together.
    ("dossier" for SNCF)
    Personnal Name Record https://en.wikipedia.org/wiki/Passenger_name_record

For memory, here is the Body structure received for
api/v5_1/pnrs (with or without date parameter)

    body.pnrs (table of pnr):
     - id: unique identifier
     - sort_date: creation date
     - system: payment system, defines the label of operation. Default is sncf.
     - after_sales_log_ids: list of ids of related refunds
     - proof_ids: list of ids of related bills
     - cent: amount in cents

    body.proofs (table of bills):
     - id: unique identifier
     - url: url of the bill
     - created_at: creation date of the bill
     - type: type of operation ('purchase' or 'refund')

    body.after_sales_logs (table of refunds):
     - id: unique identifier
     - added_cents: extr expense for the refund
     - refunded_cents: amount of reinbursment
     - penalty_cents: amount penalty
     - date

====================================================== */


/*
  REQUIRES & PARAMETERS
*/
const {
  BaseKonnector,
  requestFactory,
  saveBills,
  saveFiles,
  log,
  cozyClient,
  addData
} = require('cozy-konnector-libs')

const
  Promise   = require('bluebird'),
  moment    = require('moment'),
  pdf2bill  = require('./pdf2bill').pdf2bill

const
  DOCTYPE   = 'io.cozy.bills',
  baseUrl   = 'https://www.trainline.eu/'

let
  rq        = requestFactory({ debug: false }),
  FOLDER_ID = ''


const request = requestFactory({
  // the debug mode shows all the details about http request and responses. Very usefull for
  // debugging but very verbose. That is why it is commented out by default
  debug: false,
  // activates [cheerio](https://cheerio.js.org/) parsing on each page
  cheerio: true,
  // If cheerio is activated do not forget to deactivate json parsing (which is activated by
  // default in cozy-konnector-libs
  json: false,
  // this allows request-promise to keep cookies between requests
  jar: true
})

let that

console.log('E1');

/*
  Go !  :-)
*/
module.exports = new BaseKonnector(start)


/*
  The start function is run by the BaseKonnector instance only when it got all the account
  information (fields). When you run this connector yourself in "standalone" mode or "dev" mode,
  the account information come from ./konnector-dev-config.json file
*/
function start(fields) {
  that = this
  return (
    signin(fields)
    .then( ()             => getDataFromAPI()                             )
    .then( billsUrls      => selectNewUrls(billsUrls)                     )
    .then( newBillsUrls   => getFolderId(newBillsUrls, fields)            )
    .then( newBillsUrls   => savePdfsAndBills(newBillsUrls, fields)       )
    // .then( newBillsUrls   => savePdfsAndBills(require('./newPdfUrls.js')) )
    // .then( billsDocuments => linkBankOperations(billsDocuments, DOCTYPE)  )
    // .then( newBillsUrls   => console.log("step url",newBillsUrls)         )
  )
}


/*
  Authentification on the web service.
*/
function signin (fields) {
  const signinForm = {
    concur_auth_code: null,
    concur_migration_type: null,
    concur_new_email: null,
    correlation_key: null,
    email: fields.login,
    facebook_id: null,
    facebook_token: null,
    google_code: null,
    google_id: null,
    password: fields.password,
    source: null,
    user_itokend: null
  }
  // Signin
  const signinPath = `${baseUrl}api/v5_1/account/signin`
  return rq({
    uri: signinPath,
    method: 'POST',
    form: signinForm,
    resolveWithFullResponse: true,
    simple: false
  })
  .then(res => {
    if (res.statusCode === 422) {
      throw new Error('LOGIN_FAILED')
    }
    log('info', 'Connected')
    // Retrieve token
    const token = res.body.meta.token
    rq = rq.defaults({
      headers: { Authorization: `Token token="${token}"` }
    })
  })
}


/*
  Retrieve data from the API
*/
function getDataFromAPI () {
  const billsUrls = []
  return getDataFromAPI_recursive(billsUrls)
}


/*
  Recursively retrieve data from the API
*/
function getDataFromAPI_recursive (billsUrls, startdate) {
  // the api/v5_1/pnrs uri gives all information necessary to get bill information
  let reqUrl = `${baseUrl}api/v5_1/pnrs`
  if (startdate !== undefined) {
    reqUrl += `?date=${startdate}`
  }
  log('info', 'start getDataFromAPI_recursive : ' + reqUrl)
  return rq(reqUrl)
  .then(API_body => {
    // check there are bills (proofs)
    // log('debug', JSON.stringify(API_body));
    if (API_body.proofs && API_body.proofs.length > 0) {
      extractProofUrls(API_body, billsUrls)
      return billsUrls // TODO remove, just for tests with one loop
      return getDataFromAPI_recursive(billsUrls, computeNextDate(API_body.pnrs))
    } else {
      return billsUrls
    }
  })
}


/*
  Get the list of proof's urls from the API response
*/
function extractProofUrls (API_body, billsUrls) {
  for (let proof of API_body.proofs) {
    if (!proof.url) {
      // No need to go further.
      continue
    }
    // The proof can be duplicated : check
    if (billsUrls.indexOf(proof.url) !== -1) {
      continue
    }
    billsUrls.push(proof.url)
  }
}

/*
  Compute next date for the paginated API
*/
function computeNextDate (pnrs) {
  // The API response is paginated.
  // To get new bills, it is necessary to get api/v5_1/pnrs?date=YYYY-MM-DD
  // This function computes the date YYYY-MM-DD
  // YYYY-MM-DD :
  //    - DD: always 1
  //    - MM: month before the month of the youngest received pnr
  //    - YY: year of the first month before the youngest received pnr
  // Indentify the minimum date in the pnr list
  const minDate = pnrs.reduce(
    (min, pnr) => Math.min(+min, +new Date(pnr.sort_date)), Infinity
  )
  return moment(minDate).subtract(1, 'month').set('date', 1)
                        .format('YYYY-MM-DD')
}


/*
  Returns newPdfUrls
*/
function selectNewUrls (billsUrls) {
  // retrieve the already downloaded bills urls
  data = that.getAccountData()
  console.log(data); // TODO check in dev mode
  let downloadedBills
  if (data && data.downloadedBills) {
    downloadedBills = data.downloadedBills
  } else {
    downloadedBills = []
  }
  // return only new bill's urls
  const newBillsUrls = billsUrls.filter(el => !downloadedBills.includes(el))
  log('debug', 'in the end, newBillsUrls')
  log('debug', newBillsUrls)
  return newBillsUrls
}


/*
  Get the folder id where to write the pdfs,
  Store result in a global variable
  Return a promise
*/
function getFolderId(newPdfUrls, fields) {  // TODO : à supprimer, on peut passer par savefiles avec un folderPath
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#module_saveFiles
  return(
    cozyClient.files.statByPath(fields.folderPath)
    .then(folderDoc => {
      FOLDER_ID = folderDoc._id
      console.log("FOLDER_ID", FOLDER_ID);
      return newPdfUrls
    } )
  )
}


/*
  Fetch the pdf from server, parse it, prepare the bill
  ,save pdf and then the bill.
*/
function savePdfsAndBills (pdfUrls, fields) {
  console.log("savePdfsAndBills pdfUrls ");
  // for each url prepare a promise to chain its operations :
  //   1/ download of the pdf,
  //   2/ parse it
  //   3/ save the pdf
  //   4/ save the bill
  // list those promises in an array to return a unique promise
  const allPromises = []
  for (let url of pdfUrls) {
    let billToSave
    allPromises.push(

      // 1- download the pdf from Trainline
      rq({
        uri      : url  ,
        encoding : null ,
        headers  : {
          // 'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:36.0) Gecko/20100101 Firefox/36.0', // TODO à supprimer ?
          Authorization: '' // when you request the file, the url is in itself the token to access the file...
        }               ,
        json     : false,
        method   : 'GET',
      })

      // 2- parse the pdf to get the bill
      .then( pdfBody => {
        return pdf2bill(pdfBody, url)
      })

      // 3- save the pdf
      .then( ({bill, pdfBody}) => {
        // test of the pdfBody content :
        require('fs').writeFileSync('testPdfBody4.pdf', pdfBody) // works
        console.log(pdfBody);
        billToSave = bill

        // TODO : doesn't work (empty file in Cozy)
        // return cozyClient.files.create(pdfBody, {
        //   name       : getFileName(billToSave),
        //   dirID      : FOLDER_ID,
        //   contentType: 'application/pdf'
        // })
        

        // test with saveFiles
        return saveFiles(
          [{
            filestream: pdfBody,
            filename  : getFileName(billToSave)
          }],
          fields
        )
      })

      // 4- save the bill
      .then( fileDocument => {
        // TODO finish
        // console.log(fileDocument);
        // saveBills(
        //   [{
        //     filename:,
        //     filestream:,
        //     vendor...}],
        //   fields.folderPath,
        //   {identifiers:[trainline]}
        // )

        billToSave.invoice = `io.cozy.files:${fileDocument._id}`
        // return cozyClient.data.create(DOCTYPE, billToSave)
        checkBillsFileHasBeenDeleted()
        return require('fs').appendFileAsync('bills.json', JSON.stringify(billToSave,3))
        saveBills()
      })
      .catch(err => console.log(err) ) // TODO
    )
    break // TODO remove, just here to test on one file
  }

  return Promise.all(allPromises) // TODO limit the number of // downloads (via bluebird.each ?)
}


var isBillsFileInitiated = false
function checkBillsFileHasBeenDeleted() {
  if (isBillsFileInitiated) return
  require('fs').writeFileSync('tests/bills.json', '')
  isBillsFileInitiated = true
}


function getFileName (bill) {
  return `${moment(bill.date).format('YYYY_MM_DD')}_${'1234'.substr(0, 4)}_${bill.amount}€_Trainline.pdf`
}
