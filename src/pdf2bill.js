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
    return moment(res[0],'DD/MM/YY').date()
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
  Return a promise
*/
const pdf2bill = (pdfBody, url) => {
  return pdfParse(pdfBody, {max:1})
  .then(parsedPDF => text2bill(parsedPDF.text, url, pdfBody))
}


/*
  Generate a bill from the parsed pdf
*/
const text2bill = (pdfTXT, url, pdfBody) => {
  // console.log('pdfTXT :\n', pdfTXT);
  let
    paymentLine = pdfTXT.match(paymentReg),
    refundLine  = pdfTXT.match(refundReg)

  let bill = {
    type:       '',
    date:       '',
    vendor:     'Trainline',
    amount:     '',
    currency:   '',
    isRefund:   false, // TODO comment indique t on les avoirs ? signe du montant ?
    content:    '',
    vendor_ref: ''
  }
  if (paymentLine) {
    paymentLine     = paymentLine[0]
    bill.date       = getDate(paymentLine) // TODO mettre une string formatée ou bien laisser un objet ?
    bill.amount     = getAmount(paymentLine)
    bill.currency   = 'EUR'
    bill.fileurl    = url // TODO : confirm the attribute name
    bill.bill_ref   = getVendorRef(pdfTXT) // TODO : confirm the attribute name
  }else if (refundLine) {
    refundLine      = refundLine[0]
    bill.isRefund   = true
    bill.date       = getDate(refundLine)
    bill.amount     = getAmount(refundLine)
    bill.currency   = 'EUR'
    bill.fileurl    = url
    bill.vendor_ref = getVendorRef(pdfTXT)
  } else {
    bill.data = 'no match' // TODO raise en error
    bill.type = 'unknown'
  }
  // console.log('in the end, the bill !', bill)
  return {bill, pdfBody}
}

module.exports = {pdf2bill, getDate, getVendorRef, getAmount, text2bill}
