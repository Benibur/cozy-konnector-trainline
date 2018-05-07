'use strict'

const {pdf2bill, getDate, getVendorRef, getAmount, text2bill} = require('../src/pdf2bill')
const moment = require('moment')

/* ===================================================
  Tests for the regexp of pdf2bill.js
  To run tests : `node pdf2bill.test.js`
====================================================== */

const payment1 =
" DESCRIPTION DE L’ACHAT MONTANT Billet aller SZALIL   −  Paris Gare de Lyon  →  Grenoble Lundi 12 mai 2014 à 07:37 2 nde  classe Passager : Benjamin ANDRE 105,00 € Billet retour SZALIL   −  Grenoble  →  Paris Gare de Lyon Lundi 12 mai 2014 à 19:20 1 ère  classe Passager : Benjamin ANDRE 80,00 € DESCRIPTION DU PAIEMENT MONTANT Paiement Trainline du 10/05/14   −  2 trajets 185,00 € Carte bancaire MasterCard terminant par 2809 185,00 € INFORMATIONS COMPLÉMENTAIRES MONTANT Frais d’agence 0,00 € TVA (20 %) sur frais d’agence 0,00 € À titre indicatif, la TVA sur les transports de voyageurs n’est pas récupérable (cf. 5° du 2 du IV de l’article 206 de l’annexe II au CGI). Page 1 sur 1 JUSTIFICATIF DE PAIEMENT N° 2014-374450 Capitaine Train SAS  −  20 rue Saint-Georges  −  75009 Paris SIRET : 512 277 450 00056  −  TVA intra. : FR58512277450 Immatriculation Atout France : IM078100022 CLIENT Benjamin ANDRE ben@sonadresse.com DATE D’ACHAT Samedi 10 mai 2014 à 21h48 (heure de Paris) \n\n"

const refund1 =
" DESCRIPTION DE L’OPÉRATION MONTANT Annulation du billet retour QJOORP Brest  →  Paris Montparnasse 60,00 € DÉSCRIPTION DU REMBOURSEMENT MONTANT Remboursement Trainline du 18/10/14 60,00 € Carte bancaire MasterCard terminant par 2809 60,00 € INFORMATIONS COMPLÉMENTAIRES MONTANT Frais d’agence 0,00 € TVA (20 %) sur frais d’agence 0,00 € À titre indicatif, la TVA sur les transports de voyageurs n’est pas récupérable (cf. 5° du 2 du IV de l’article 206 de l’annexe II au CGI). Page 1 sur 1 JUSTIFICATIF DE REMBOURSEMENT Capitaine Train SAS  −  20 rue Saint-Georges  −  75009 Paris SIRET : 512 277 450 00056  −  TVA intra. : FR58512277450 Immatriculation Atout France : IM078100022 CLIENT Benjamin ANDRE ben@sonadresse.com DATE DU REMBOURSEMENT Mardi 21 octobre 2014 à 18h40 (heure de Paris) \n\n"

const payment2 =
" DESCRIPTION DE L’ACHAT MONTANT Billet aller RUJDMP   −  Paris Gare de Lyon  →  Lyon Part-Dieu Vendredi 27 avril 2018 à 07:53 2 nde  classe Passager : Benjamin ANDRE 75,00 € Billet retour RUJDMP   −  Lyon Part-Dieu  →  Paris Gare de Lyon Vendredi 27 avril 2018 à 17:34 2 nde  classe Passager : Benjamin ANDRE 75,00 € DESCRIPTION DU PAIEMENT MONTANT Paiement Trainline du 26/04/18   −  2 trajets 150,00 € Carte bancaire MasterCard terminant par 6115 150,00 € INFORMATIONS COMPLÉMENTAIRES MONTANT Frais d’agence 0,00 € TVA (20 %) sur frais d’agence 0,00 € À titre indicatif, la TVA sur les transports de voyageurs n’est pas récupérable (cf. 5° du 2 du IV de l’article 206 de l’annexe II au CGI). Page 1 sur 1 JUSTIFICATIF DE PAIEMENT N° 2018-10725016 Trainline SAS  −  20 rue Saint-Georges  −  75009 Paris SIRET : 512 277 450 00056  −  TVA intra. : FR58512277450 Immatriculation Atout France : IM078100022 CLIENT Benjamin ANDRE ben@sonadresse.com DATE D’ACHAT Jeudi 26 avril 2018 à 07h26 (heure de Paris) \n\n"


function getAmountTest() {
  if(getAmount('lkqj mlkdjf klj 23   24 2345 45 . 45€sdfqdf') !== 24234545.45){
    console.error('Error in getAmountTest T1')

  } else if (getAmount('lkqj mlkdjf klj 23   24 2345 45 . 45 €sdfqdf', '€' ) !== 24234545.45) {
    console.error('Error in getAmountTest T2')

  } else if (getAmount('lkqj mlkdjf klj 23   24  2345 45 .45 6 €sdfqdf', '€' ) !== 234545.456) {
    console.error('Error in getAmountTest T2')

  } else {
    console.log('** getAmountTest OK **')
  }
}


function getDateTest() {
  if(getDate('SCRIPTION DU REMBOURSEMENT MONTANT Remboursement Trainline du 18/09/17 60,00 €' ) !== moment('18/09/2017','DD/MM/YYYY').date()){
    console.error('Error in getDateTest T1')
  } else {
    console.log('** getDateTest   OK **')
  }
}


/* run tests  */
getAmountTest()
getDateTest()

let result

result = text2bill(payment1, 'http://a-nice-url.com')
// console.log(result.bill)
// TODO test result

result = text2bill(payment2, 'http://a-nice-url.com')
// console.log(result.bill)
// TODO test result

result = text2bill(refund1, 'http://a-nice-url.com')
// console.log(result.bill)
// TODO test result
