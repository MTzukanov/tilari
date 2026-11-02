/**
 * The 6B return field by field. Codes, money types and formulas come from Vero's record description
 * `VSY06B26` v1.1; order and wording come from OmaVero's print. Finnish wording stays as Vero writes
 * it, like the VAT return's (docs/TAX_RETURN.md).
 */

/** The record description this catalogue was checked against. */
export const SPEC_YEAR = 2026

export type Side = 'income' | 'taxfree' | 'cost' | 'nondeductible' | 'asset' | 'debt' | 'equity'

export type RowDef = {
  /** Kirjanpito column, or the only column. */
  code: number
  /** Verotus column, where the form has both. */
  taxCode?: number
  label: string
  /** Negatives allowed (`G13,2`); otherwise `R13,2`. */
  signed: boolean
  /** Book and tax can differ here, so a figure from the ledger asks to be checked. */
  check?: boolean
  /** Not in the period's income statement, so only ever typed by hand. */
  manualOnly?: boolean
}

export type TotalDef = { code: number; label: string }

export type GroupDef = {
  key: string
  title: string
  side: Side
  rows: RowDef[]
  totals?: TotalDef[]
}

function money(code: number, label: string, extra: Partial<RowDef> = {}): RowDef {
  return { code, label, signed: true, ...extra }
}

function paired(code: number, taxCode: number, label: string, extra: Partial<RowDef> = {}): RowDef {
  return { code, taxCode, label, signed: true, check: true, ...extra }
}

function balance(code: number, label: string, extra: Partial<RowDef> = {}): RowDef {
  return { code, label, signed: false, ...extra }
}

export const PNL_GROUPS: GroupDef[] = [
  {
    key: 'business',
    title: 'Liiketoiminta ja oma käyttö',
    side: 'income',
    rows: [money(330, 'Liikevaihto'), money(331, 'Valmistus omaan käyttöön')],
  },
  {
    key: 'other_operating',
    title: 'Toiminnan muut tuotot',
    side: 'income',
    rows: [
      paired(332, 333, 'Käyttöomaisuusosakkeiden luovutus- ja purkuvoitot'),
      money(260, 'Käyttöomaisuuskiinteistöjen luovutusvoitot'),
      money(334, 'Muun käyttöomaisuuden luovutusvoitot'),
      money(335, 'Saadut avustukset ja tuet'),
      money(336, 'Muut tuotot'),
    ],
  },
  {
    key: 'financial_income',
    title: 'Rahoitustuotot',
    side: 'income',
    rows: [
      paired(337, 338, 'Saadut osingot ja ylijäämät'),
      money(339, 'Korkotuotot konserniyhteysosapuolilta'),
      money(340, 'Korkotuotot omistusyhteysyrityksiltä'),
      money(341, 'Muut korkotulot'),
      paired(342, 343, 'Voitto-osuudet yhtymistä'),
      money(344, 'Rahoitusomaisuuden luovutusvoitot'),
      paired(561, 563, 'Tuotot kapitalisaatiosopimuksista ja tietyistä vakuutuksista'),
      money(345, 'Muut rahoitustuotot'),
    ],
  },
  {
    key: 'other_income',
    title: 'Muut tuotot',
    side: 'income',
    rows: [
      paired(346, 347, 'Palautuvat arvonalennukset'),
      money(439, 'Saatu konserniavustus'),
      paired(350, 351, 'Varausten vähennykset'),
      money(352, 'Osuus väliyhteisön tulosta'),
      money(261, 'Muun omaisuuden luovutusvoitot'),
      money(353, 'Muut veronalaiset tuotot (ei tilikauden tuloslaskelmassa)', { manualOnly: true }),
    ],
    totals: [{ code: 354, label: 'Elinkeinotoiminnan veronalaiset tuotot yhteensä' }],
  },
  {
    key: 'tax_free',
    title: 'Verottomat tuotot',
    side: 'taxfree',
    rows: [
      money(357, 'Veronpalautus'),
      money(320, 'Elokuvan tuotantotuki'),
      money(318, 'Luovutusvoitot, epäsuora tuloutus'),
      money(358, 'Tuloslaskelman muut verottomat tuotot'),
    ],
  },
  {
    key: 'materials',
    title: 'Materiaalit ja palvelut',
    side: 'cost',
    rows: [money(359, 'Ostot ja varastojen muutokset'), money(360, 'Ulkopuoliset palvelut')],
  },
  {
    key: 'personnel',
    title: 'Henkilöstökulut',
    side: 'cost',
    rows: [money(361, 'Palkat ja palkkiot'), money(362, 'Eläkekulut'), money(363, 'Muut henkilösivukulut')],
  },
  {
    key: 'depreciation',
    title: 'Poistot',
    side: 'cost',
    rows: [paired(364, 365, 'Vähennettävät poistot')],
  },
  {
    key: 'other_operating_costs',
    title: 'Toiminnan muut kulut',
    side: 'cost',
    rows: [
      paired(368, 369, 'Edustuskulut', { check: false }),
      paired(370, 371, 'Annetut lahjoitukset'),
      paired(372, 373, 'Käyttöomaisuusosakkeiden luovutustappiot ja purkutappiot'),
      money(374, 'Muun käyttöomaisuuden luovutustappiot'),
      money(375, 'Leasingmaksut'),
      money(376, 'Myyntisaamisten arvonalentumiset'),
      money(377, 'Muut vähennyskelpoiset kulut'),
    ],
  },
  {
    key: 'nondeductible',
    title: 'Vähennyskelvottomat kulut',
    side: 'nondeductible',
    rows: [
      money(378, 'Välittömät verot'),
      money(379, 'Veronkorotukset ja myöhästymismaksut'),
      money(380, 'Sakot ja muut rangaistusmaksut'),
      money(381, 'Fuusiotappio'),
      money(382, 'Käyttöomaisuusosakkeiden arvonalentumiset'),
      money(383, 'Pakolliset varaukset'),
      money(388, 'Konsernituki ja saamisten arvonalentumiset'),
      money(384, 'Muut vähennyskelvottomat kulut'),
    ],
  },
  {
    key: 'financial_costs',
    title: 'Rahoituskulut',
    side: 'cost',
    rows: [
      money(328, 'Korkokulut konserniyhteysosapuolille'),
      money(386, 'Korkokulut omistusyhteysyrityksille'),
      money(387, 'Muut korkokulut'),
      money(398, 'Korkokuluna käsiteltävät rahoituskulut'),
      money(399, 'Korkokulujen oikaisu'),
      paired(389, 390, 'Muun rahoitusomaisuuden menetykset ja arvonalentumiset'),
      money(391, 'Rahoitusomaisuuden luovutustappiot'),
      money(392, 'Muut rahoituskulut'),
    ],
  },
  {
    key: 'other_costs',
    title: 'Muut kulut',
    side: 'cost',
    rows: [
      money(327, 'Osuuskunnan vähennyskelpoinen ylijäämänpalautus'),
      money(436, 'Annettu konserniavustus'),
      paired(394, 395, 'Varausten lisäykset'),
      paired(270, 271, 'Muun omaisuuden luovutustappiot ja arvonalentumiset'),
      paired(272, 273, 'Muuhun omaisuuteen kuuluvien saamisten arvonalentumiset'),
      money(695, 'Tutkimus- ja kehittämistoiminnan väliaikainen lisävähennys', { manualOnly: true }),
      money(697, 'Tutkimus- ja kehittämistoiminnan yleinen lisävähennys', { manualOnly: true }),
      money(698, 'Tutkimus- ja kehittämistoiminnan ylimääräinen lisävähennys', { manualOnly: true }),
      money(696, 'Ulkomaisen tytäryhtiön tappiot (konsernivähennys)', { manualOnly: true }),
      money(396, 'Muut vähennyskelpoiset kulut (ei tilikauden tuloslaskelmassa)', { manualOnly: true }),
    ],
    totals: [{ code: 397, label: 'Elinkeinotoiminnan verotuksessa vähennyskelpoiset kulut yhteensä' }],
  },
]

/** 504 only applies to a loss and is typed by hand; 500 and 505 come from the formula. */
export const LOSS_EXCLUSION_CODE = 504

export const RESULT_TOTALS: TotalDef[] = [
  { code: 500, label: 'Elinkeinotoiminnan tulos' },
  { code: 505, label: 'Elinkeinotoiminnan tappio' },
]

export const BALANCE_GROUPS: GroupDef[] = [
  {
    key: 'fixed_assets',
    title: 'Käyttöomaisuus',
    side: 'asset',
    rows: [
      balance(400, 'Aineettomat oikeudet'),
      balance(401, 'Pitkävaikutteiset menot'),
      balance(402, 'Kiinteistöt'),
      balance(403, 'Koneet ja kalusto'),
      balance(404, 'Ennakkomaksut'),
      balance(405, 'Käyttöomaisuusarvopaperit', { check: true }),
      balance(406, 'Saamiset saman konsernin yrityksiltä'),
      balance(407, 'Saamiset omistusyhteysyrityksiltä'),
      balance(408, 'Muut käyttöomaisuussaamiset'),
      balance(409, 'Muu käyttöomaisuus'),
    ],
    totals: [{ code: 410, label: 'Käyttöomaisuus yhteensä' }],
  },
  {
    key: 'inventory',
    title: 'Vaihto-omaisuus',
    side: 'asset',
    rows: [
      balance(411, 'Aineet ja tarvikkeet'),
      balance(412, 'Keskeneräiset tuotteet'),
      balance(413, 'Valmiit tuotteet'),
      balance(414, 'Tavarat'),
      balance(415, 'Vaihto-omaisuuskiinteistöt'),
      balance(416, 'Vaihto-omaisuusarvopaperit'),
      balance(417, 'Muu vaihto-omaisuus'),
    ],
    totals: [{ code: 418, label: 'Vaihto-omaisuus yhteensä' }],
  },
  {
    key: 'financial_assets',
    title: 'Rahoitusomaisuus',
    side: 'asset',
    rows: [
      balance(419, 'Myyntisaamiset'),
      balance(420, 'Saamiset saman konsernin yrityksiltä'),
      balance(421, 'Saamiset omistusyhteysyrityksiltä'),
      balance(422, 'Lainasaamiset'),
      balance(423, 'Muut saamiset'),
      balance(424, 'Rahoitusomaisuusarvopaperit'),
      balance(425, 'Siirtosaamiset'),
      balance(463, 'Osatuloutuksen saamiset'),
      balance(426, 'Rahat'),
      balance(427, 'Pankkisaamiset'),
      balance(428, 'Muu rahoitusomaisuus'),
    ],
    totals: [{ code: 429, label: 'Rahoitusomaisuus yhteensä' }],
  },
  {
    key: 'other_assets',
    title: 'Muu omaisuus',
    side: 'asset',
    rows: [
      balance(430, 'Arvopaperit'),
      balance(431, 'Kiinteistöt'),
      balance(432, 'Osakaslainat'),
      balance(437, 'Saamiset saman konsernin yrityksiltä'),
      balance(438, 'Muut saamiset'),
      balance(433, 'Muu tähän ryhmään kuuluva omaisuus'),
    ],
    totals: [
      { code: 434, label: 'Muu omaisuus yhteensä' },
      { code: 435, label: 'Varat yhteensä' },
    ],
  },
  {
    key: 'debts',
    title: 'Velat',
    side: 'debt',
    rows: [
      balance(450, 'Joukkovelkakirjalainat'),
      balance(451, 'Vaihtovelkakirjalainat'),
      balance(452, 'Lainat rahoituslaitoksilta'),
      balance(453, 'Ostovelat'),
      balance(454, 'Velat saman konsernin yrityksille'),
      balance(455, 'Velat omistusyhteysyrityksille'),
      balance(456, 'Velat osakkaille'),
      balance(457, 'Siirtovelat'),
      balance(464, 'Saadut ennakot, pitkäaikaiset'),
      balance(465, 'Saadut ennakot, lyhytaikaiset'),
      balance(458, 'Muut velat'),
      balance(459, 'Pääomalainat'),
    ],
    totals: [
      { code: 460, label: 'Velat yhteensä' },
      { code: 461, label: 'Lyhytaikaiset velat yhteensä' },
      { code: 462, label: 'Pitkäaikaiset velat yhteensä' },
      { code: 573, label: 'Positiivinen nettovarallisuus' },
      { code: 574, label: 'Negatiivinen nettovarallisuus' },
    ],
  },
  {
    key: 'equity',
    title: 'Oma pääoma',
    side: 'equity',
    rows: [
      balance(470, 'Osake- tai osuuspääoma'),
      balance(495, 'Muu sidottu oma pääoma'),
      balance(496, 'Sijoitetun vapaan oman pääoman rahasto'),
      money(497, 'Muut rahastot'),
      balance(474, 'Edellisten tilikausien voitto'),
      balance(475, 'Edellisten tilikausien tappio'),
      balance(476, 'Tilikauden voitto'),
      balance(477, 'Tilikauden tappio'),
      balance(677, 'Verotettava tulos', { manualOnly: true }),
      balance(678, 'Verotuksessa vahvistettava tappio', { manualOnly: true }),
      balance(679, 'Verovapaat tuotot', { manualOnly: true }),
      balance(680, 'Verotuksessa vähennyskelvottomat kulut', { manualOnly: true }),
      money(681, 'Muut kirjanpidon ja verotuksen tulosten erot', { manualOnly: true }),
    ],
    totals: [{ code: 478, label: 'Oma pääoma yhteensä' }],
  },
]

export const ALL_GROUPS: GroupDef[] = [...PNL_GROUPS, ...BALANCE_GROUPS]

/** Vero's section 10 formulas. */
export const TAXABLE_INCOME_CODES = [330, 331, 333, 260, 334, 335, 336, 338, 339, 340, 341, 343, 344, 563, 345, 347, 439, 351, 352, 261, 353]
export const DEDUCTIBLE_COST_CODES = [359, 360, 361, 362, 363, 365, 369, 371, 373, 374, 375, 376, 377, 328, 386, 387, 398, 399, 390, 391, 392, 327, 436, 395, 271, 273, 695, 697, 698, 696, 396]
export const FIXED_ASSET_CODES = [400, 401, 402, 403, 404, 405, 406, 407, 408, 409]
export const INVENTORY_CODES = [411, 412, 413, 414, 415, 416, 417]
export const FINANCIAL_ASSET_CODES = [419, 420, 421, 422, 423, 424, 425, 463, 426, 427, 428]
export const OTHER_ASSET_CODES = [430, 431, 432, 437, 438, 433]
export const DEBT_CODES = [450, 451, 452, 453, 454, 455, 456, 457, 464, 465, 458, 459]

/** Every row with both its codes, for finding a field's wording and side. */
export function rowByCode(code: number): { row: RowDef; group: GroupDef } | null {
  for (const group of ALL_GROUPS) {
    for (const row of group.rows) {
      if (row.code === code || row.taxCode === code) return { row, group }
    }
  }
  return null
}

const OTHER_FIELDS: Record<number, string> = {
  41: 'Yhteyshenkilö',
  42: 'Puhelinnumero',
  44: 'Sähköposti',
  701: 'Osakkeenomistajan nimi',
  522: 'Jaettavan osingon tai ylijäämän määrä',
  293: 'Vapaan oman pääoman rahastosta jaettavaksi päätetty määrä',
  140: 'Yhtiön tai osuuskunnan nimi',
  240: 'Yhtiön tai osuuskunnan nimi',
  440: 'Yhtiön tai osuuskunnan nimi',
  760: 'Luovutetun kohteen nimi',
  761: 'Luovutetun kohteen tunnus',
  762: 'Huoneiston numero',
  831: 'Luovutetun kohteen nimi',
  832: 'Luovutetun kohteen tunnus',
}

/** OmaVero's wording for a file code: the owner never sees the codes there. */
export function fieldName(code: number): string {
  return rowByCode(code)?.row.label ?? OTHER_FIELDS[code] ?? String(code)
}

export type AnswerDef = {
  key: string
  label: string
  /** The file's code when the answer is yes (`1`). OmaVero asks others that the file does not hold. */
  fileCode?: number
  /** The form a yes needs. */
  form?: string
  /** A yes needs fields this version does not produce, so no file is made. */
  blocksFile?: boolean
}

/** OmaVero's yes/no questions, in its order. Each needs an answer: one left open is not a no. */
export const ANSWERS: AnswerDef[] = [
  { key: 'owner_housing', label: 'Onko yrittäjäosakas tai hänen perheensä käyttänyt yhteisön omistamaa huoneistoa tai kiinteistöä asuntona?', blocksFile: true },
  { key: 'own_shares_changed', label: 'Onko yhtiö lunastanut, luovuttanut tai hankkinut omia osakkeitaan?', fileCode: 586 },
  { key: 'share_capital_changed', label: 'Onko osakepääomaa muutettu tilikauden päättymisen jälkeen?', blocksFile: true },
  { key: 'credit_institution', label: 'Onko yhtiö luottolaitos, sijoituspalveluyritys tai vakuutuslaitos?', blocksFile: true },
  { key: 'only_other_activity', label: 'Harjoittaako yhtiö ainoastaan muuta toimintaa kuin elinkeinotoimintaa?', fileCode: 169, blocksFile: true },
  { key: 'all_dividends_tax_free', label: 'Ovatko kaikki osinkotulot Suomesta saatuja ja verovapaita?' },
  { key: 'form_65', label: 'Omistaako yhtiö yli 10 % toisesta yhtymästä tai yhtiöstä tai onko yhtiö antanut tai saanut konserniavustusta tilikauden aikana (lomake 65)?', form: '65' },
  { key: 'form_66', label: 'Pitääkö yhtiön antaa selvitys tytäryhtiöistä veron tilitystä varten (lomake 66)?', form: '66' },
  { key: 'form_70', label: 'Vaatiiko yhtiö hyvitystä ulkomaille maksamistaan veroista (lomake 70)?', form: '70' },
  { key: 'form_75', label: 'Onko yhtiöllä kiinteä toimipaikka ulkomailla (lomake 75)?', form: '75' },
  { key: 'ifrs', label: 'Onko yhtiön tilinpäätös kansainvälisten tilinpäätösstandardien mukainen?', fileCode: 173 },
  { key: 'transfer_pricing', label: 'Onko yhtiö velvollinen laatimaan siirtohinnoitteludokumentoinnin (lomake 78)?', fileCode: 182, form: '78' },
  { key: 'business_transfer', label: 'Onko yhtiö tehnyt liiketoimintasiirron verovuoden aikana?', fileCode: 174 },
  { key: 'share_exchange', label: 'Onko yhtiö hankkinut osakkeita osakevaihdossa verovuoden aikana?', fileCode: 176 },
  { key: 'aland', label: 'Onko yhtiöllä toimintaa sekä Manner-Suomessa että Ahvenanmaalla?', fileCode: 184 },
  { key: 'form_81', label: 'Pitääkö yhtiön antaa selvitys elinkeinotoiminnan nettokorkomenoista (lomake 81)?', form: '81' },
  { key: 'form_67a', label: 'Vaatiiko yhtiö tutkimus- ja kehittämistoiminnan väliaikaista lisävähennystä (lomake 67A)?', form: '67A' },
  { key: 'form_67y', label: 'Vaatiiko yhtiö tutkimus- ja kehittämistoiminnan yleistä tai ylimääräistä lisävähennystä (lomake 67Y)?', form: '67Y' },
]

/** The questions with neither a yes nor a no yet. */
export function openAnswers(answers: Record<string, boolean>): AnswerDef[] {
  return ANSWERS.filter((answer) => answers[answer.key] == null)
}
