'use strict'

const pdfParse   = require('pdf-parse'),
      moment     = require('moment'),
      paymentReg = /DESCRIPTION DU PAIEMENT.*?€/,
      refundReg  = /SCRIPTION DU REMBOURSEMENT.*?€/,
      dateReg    = /\d\d\/\d\d\/\d\d/,
      refReg     = /\s*N°\s*(\d\d\d\d-\d+)/,
      amountReg  = new RegExp('((\\d+\\s?)+[\\.,]?\\s?(\\d+\\s?)+)\\€')


function getAmount(line) {
  let amount = amountReg.exec(line)[1]
  amount = amount.replace(/\s/g,'')
  amount = amount.replace(/,/g,'.')
  amount = parseFloat(amount)
  return amount
}


function getDate(line) {
  const res = line.match(dateReg)
  if (res) {
    console.log(res);
    console.log(moment(res[0],'DD/MM/YY').date());
    return moment(res[0],'DD/MM/YY')
  }else {
    // TODO raise a parsing error
  }
}


function getVendorRef(txt) {
  const res = txt.match(refReg)
  if (res) {
    return res[1]
  } else {
    return ''
  }
}

/*
  Return a promise in charge of returning a bill from the parsed pdf
*/
const pdf2bill = (pdfBody, url) => {
  return pdfParse(pdfBody, {max:1})
  .then(parsedPDF => text2bill(parsedPDF.text, url, pdfBody))
}


/*
  Generate a bill from the parsed pdf
*/
function text2bill(pdfTXT, url, pdfBody) {
  // console.log('pdfTXT :\n', pdfTXT);
  let
    paymentLine = pdfTXT.match(paymentReg),
    refundLine  = pdfTXT.match(refundReg),
    bill = {
      type:       '',
      vendor:     'Trainline',
      date:       '',
      amount:     '',
      currency:   '',
      isRefund:   false,
      vendor_ref: ''
    }
  if (paymentLine) {
    paymentLine          = paymentLine[0]
    bill.date            = getDate(paymentLine).format() // TODO mettre une string formatée ou bien laisser un objet ?
    bill.amount          = getAmount(paymentLine)
    bill.currency        = 'EUR'
    bill.billOriginalUrl = url // TODO : confirm the attribute name
    bill.vendorRef       = getVendorRef(pdfTXT)
  }else if (refundLine) {
    refundLine           = refundLine[0]
    bill.isRefund        = true
    bill.date            = getDate(refundLine).format()
    bill.amount          = getAmount(refundLine)
    bill.currency        = 'EUR'
    bill.billOriginalUrl = url
    bill.vendorRef       = getVendorRef(pdfTXT)
  } else {
    // TODO raise en error that causes a break in for this bill but let the rest continues.
  }
  console.log('in the end, the bill !', bill)
  console.log('bill.date', bill.date)

  return {bill, pdfBody}
}

module.exports = {pdf2bill, getDate, getVendorRef, getAmount, text2bill}
