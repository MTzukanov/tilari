/** Finnish labels for ALV codes and declaration boxes (HTML laskelma + UI fallback). */

export const VAT_CODE_TITLES: Record<number, string> = {
  0: 'Ei ALV',
  11: 'Verollinen myynti (netto)',
  111: 'VERON MÄÄRÄ Verollinen myynti (netto)',
  12: 'Verollinen myynti (brutto)',
  112: 'VERON MÄÄRÄ Verollinen myynti (brutto)',
  18: 'Maksuperusteinen myynti',
  118: 'VERON MÄÄRÄ Maksuperusteinen myynti',
  418: 'Maksuperusteinen myynti – kohdentamaton ALV',
  19: 'Nollaverokannan alainen myynti',
  21: 'Verollinen osto (netto)',
  221: 'VÄHENNYKSEN MÄÄRÄ Verollinen osto (netto)',
  28: 'Maksuperusteinen osto',
  228: 'VÄHENNYKSEN MÄÄRÄ Maksuperusteinen osto',
  428: 'Maksuperusteinen osto – kohdentamaton vähennys',
  29: 'Palveluosto EU:n ulkopuolelta',
  129: 'VERON MÄÄRÄ Palveluosto EU:n ulkopuolelta',
  229: 'VÄHENNYKSEN MÄÄRÄ Palveluosto EU:n ulkopuolelta',
  25: 'Palveluiden yhteisöhankinta',
  125: 'VERON MÄÄRÄ Yhteisöhankinta',
  225: 'VÄHENNYKSEN MÄÄRÄ Yhteisöhankinta',
  13: 'Voittomarginaalimenettely, myynti',
  113: 'VERON MÄÄRÄ Voittomarginaalimenettely',
  913: 'Voittomarginaaliveron oikaisu',
  14: 'Tavaroiden yhteisömyynti',
  15: 'Palveluiden yhteisömyynti',
  16: 'Rakentamispalveluiden ja metalliromun myynti',
  22: 'Verollinen osto (brutto)',
  222: 'VÄHENNYKSEN MÄÄRÄ Verollinen osto (brutto)',
  23: 'Voittomarginaalimenettely, osto',
  24: 'Tavaroiden yhteisöhankinta',
  124: 'VERON MÄÄRÄ Tavaroiden yhteisöhankinta',
  224: 'VÄHENNYKSEN MÄÄRÄ Tavaroiden yhteisöhankinta',
  26: 'Rakentamispalveluiden ja metalliromun osto',
  126: 'VERON MÄÄRÄ Rakentamispalvelut ja metalliromu',
  226: 'VÄHENNYKSEN MÄÄRÄ Rakentamispalvelut ja metalliromu',
  27: 'Tavaroiden maahantuonti EU:n ulkopuolelta',
  127: 'VERON MÄÄRÄ Maahantuonti',
  227: 'VÄHENNYKSEN MÄÄRÄ Maahantuonti',
  51: 'Ennakkolasku, myynti',
  151: 'VERON MÄÄRÄ Ennakkolasku',
  901: 'ALV-tilitys',
  932: 'Vähennyskelvoton vero',
}

export const VAT_BOX_TITLES: Record<number, string> = {
  301: 'Suoritettava 25,5 %:n / 24 %:n vero kotimaan myynnistä',
  302: 'Suoritettava 13,5 %:n / 14 %:n vero kotimaan myynnistä',
  303: 'Suoritettava 10 %:n vero kotimaan myynnistä',
  304: 'Vero tavaroiden maahantuonnista EU:n ulkopuolelta',
  305: 'Vero tavaraostoista muista EU-maista',
  306: 'Vero palveluostoista muista EU-maista',
  307: 'Verokauden vähennettävä vero',
  308: 'Maksettava vero / Palautukseen oikeuttava vero',
  309: '0-verokannan alainen liikevaihto',
  310: 'Tavaroiden maahantuonnit EU:n ulkopuolelta',
  311: 'Tavaroiden myynnit muihin EU-maihin',
  312: 'Palveluiden myynnit muihin EU-maihin',
  313: 'Tavaraostot muista EU-maista',
  314: 'Palveluostot muista EU-maista',
  318: 'Vero rakentamispalveluiden ja metalliromun ostoista',
  319: 'Rakentamispalveluiden ja metalliromun myynnit',
  320: 'Rakentamispalveluiden ja metalliromun ostot',
}

export function vatCodeTitle(code: number): string {
  return VAT_CODE_TITLES[code] || `ALV-koodi ${code}`
}

export function vatBoxTitle(box: number): string {
  return VAT_BOX_TITLES[box] || `Verokoodi ${box}`
}
