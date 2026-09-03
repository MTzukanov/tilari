# Vocabulary (FI · SV · EN · DE)

Finnish bookkeeping terms used in this app and in Kitsas schema 24.
UI chrome lives in `frontend/src/i18n/locales/`; this file is the
accounting meaning map used by the Swedish, English, and German catalogs.

English docs and code identifiers use the English column. Finnish schema
keys (`Tosite`, `Vienti`, `Asetus.tilinpaatos`, …) stay as stored. In
Markdown, put the Finnish term in `<abbr title="tilinpäätös">statements</abbr>`
when a reader might need it; in TypeScript, a short comment on first use.

Finnish *kirjanpito* is double-entry bookkeeping under the Finnish Accounting
Act (KPL).

Amounts in the API are integer **cents** (`*_snt`). The UI shows euros.
Number and date formats are independent of UI language and default to
Finnish (`1 105,00 €`, `2.1.2026`). English formats use `€1,105.00`;
German uses `1.105,00 €`.

## Practice and identifiers

| Finnish | Swedish | English | German |
|---------|---------|---------|--------|
| Kirjanpito | Bokföring | Bookkeeping | Buchhaltung |
| Kirjanpitotiedosto | Bokföringsfil | Bookkeeping file | Buchhaltungsdatei |
| Y-tunnus | FO-nummer | Business ID | Handelsregisternummer (FI) |
| Tilikausi | Räkenskapsår | Financial year | Geschäftsjahr |
| Tilinpäätös | Bokslut | Financial statements / year-end close | Jahresabschluss |
| Tilit päätetty | Böcker avslutade | Books closed (lock date) | Bücher abgeschlossen |
| Harjoitus / harjoituskirjanpito | Övningsbokföring | Practice accounting | Übungsbuchhaltung |
| Harjoittelutila | Övningsläge | Practice mode | Übungsmodus |

## Voucher (tosite)

| Finnish | Swedish | English | German |
|---------|---------|---------|--------|
| Tosite | Verifikat | Voucher | Beleg |
| Tositelaji / tositetyyppi | Verifikattyp | Voucher type | Belegart |
| Tositteen pvm | Verifikatdatum | Voucher date | Belegdatum |
| Sähköinen tosite | Elektroniskt verifikat | Electronic voucher | Elektronischer Beleg |
| Kirjaa | Bokföra | Post | Buchen |
| Vienti | Transaktion / bokföringsrad | Posting / journal line | Buchung / Buchungszeile |
| Viennit | Transaktioner / rader | Postings / lines | Buchungen / Buchungszeilen |
| Liitteet | Bilagor | Attachments | Anlagen |
| Luonnos | Utkast | Draft | Entwurf |
| Kirjanpidossa | Bokförd | Posted | Gebucht |
| Mallipohja | Mall | Template | Vorlage |
| Poistettu | Raderad | Deleted | Gelöscht |

Finnish *vienti* is **not** “export”. It is one debit or credit line on a voucher.

### Voucher types (`Tosite.tyyppi`)

| Code | Finnish | Swedish | English | German |
|------|---------|---------|---------|--------|
| 0 | Muu | Övrigt | Other | Sonstiges |
| 90 | Tuonti | Import | Import | Import |
| 100 | Meno | Utgift | Expense | Ausgabe |
| 110 | Saapunut verkkolasku | Inkommen e-faktura | Incoming e-invoice | Eingangs-eRechnung |
| 120 | Kululasku | Utlägg | Expense claim | Spesenabrechnung |
| 200 | Tulo | Inkomst | Income / revenue | Einnahme |
| 210 | Myyntilasku | Kundfaktura | Sales invoice | Ausgangsrechnung |
| 214 | Hyvityslasku | Kreditnota | Credit note | Gutschrift |
| 216 | Maksumuistutus | Betalningspåminnelse | Payment reminder | Zahlungserinnerung |
| 300 | Siirto | Överföring | Transfer | Umbuchung |
| 400 | Tiliote | Kontoutdrag | Bank statement | Kontoauszug |
| 500 | Palkka | Lön | Payroll | Lohn |
| 700 | Muistio | Promemoria | Memo | Memo |
| 800 | Liitetieto | Notupplysning | Notes to the accounts | Anhangangabe |
| 1000 | Järjestelmätosite | Systemverifikat | System voucher | Systembeleg |
| 9010 | Tilinavaus | Ingående balans | Opening balances | Eröffnungsbilanz |
| 9040 | Yksityistilien päättäminen | Avslut av privatkonton | Close private accounts | Abschluss der Privatkonten |
| 9100 | ALV-laskelma | Momsdeklaration | VAT return / VAT voucher | USt-Voranmeldung |
| 9110 | Yhteenvetoilmoitus | Sammandragsdeklaration | EC sales list | Zusammenfassende Meldung |
| 9910 | Poistolaskelma / poisto | Avskrivning | Depreciation | Abschreibung |
| 9920 | Jaksotus | Periodisering | Accrual / deferral | Abgrenzung |
| 9930 | Tulovero | Inkomstskatt | Income tax | Ertragsteuer |

## Accounts, postings, reports

| Finnish | Swedish | English | German |
|---------|---------|---------|--------|
| Tili | Konto | Account | Konto |
| Tilikartta | Kontoplan | Chart of accounts | Kontenplan |
| Selite / riviselite | Förklaring | Description / narration | Buchungstext |
| Debet | Debet | Debit | Soll |
| Kredit | Kredit | Credit | Haben |
| Vastatili | Motkonto | Offset / counterpart account | Gegenkonto |
| Maksutapa | Betalningssätt | Payment method (often the bank account) | Zahlungsart |
| Alkusaldo | Ingående saldo | Opening balance | Anfangssaldo |
| Loppusaldo | Utgående saldo | Closing balance | Schlusssaldo |
| Saldo | Saldo | Balance | Saldo |
| Päiväkirja | Dagbok | Journal (chronological) | Journal |
| Pääkirja | Huvudbok | General ledger | Hauptbuch |
| Tase | Balansräkning | Balance sheet | Bilanz |
| Tuloslaskelma | Resultaträkning | Income statement / P&L | Gewinn- und Verlustrechnung (GuV) |
| Vastaavaa | Tillgångar | Assets | Aktiva |
| Vastattavaa | Eget kapital och skulder | Equity and liabilities | Passiva |
| Tase-erät / tase-erittely | Specifikation av balansposter | Balance-sheet itemization | Bilanzgliederung / Kontennachweis |
| Erittelemättömät | Ospecificeade | Unassigned | Nicht zugeordnet |
| Avaava / avaus | Ingående | Opening | Eröffnung |
| Muutos | Förändring | Period change | Veränderung |

### Account type codes (`Tili.tyyppi`)

| Code | Finnish | Swedish | English | German |
|------|---------|---------|---------|--------|
| A | Vastaavaa | Tillgångar | Assets | Aktiva |
| APM | Poistokelpoinen omaisuus, menojäännös | Avskrivningsbar tillgång, restvärde | Depreciable asset, declining balance | Abnutzbares Vermögen, degressive AfA |
| APT | Poistokelpoinen omaisuus, tasapoisto | Avskrivningsbar tillgång, linjär | Depreciable asset, straight-line | Abnutzbares Vermögen, lineare AfA |
| AS | Saatavaa | Fordran | Receivable | Forderung |
| AO | Myyntisaatavat | Kundfordringar | Trade receivables | Forderungen aus Lieferungen |
| AJ | Siirtosaamiset | Förutbetalda kostnader / upplupna intäkter | Prepayments and accrued income | Rechnungsabgrenzung (aktiv) |
| AL | Arvonlisäverosaatava | Momsfordran | VAT receivable | USt-Forderung |
| ALM | Maksuperusteisen ALV:n kohdentamaton saatava | Oallokerad kassamomsfordran | Unallocated cash-basis VAT receivable | Nicht zugeordnete Ist-USt-Forderung |
| AV | Verosaatava | Skattefordran | Tax receivable | Steuerforderung |
| ARK | Käteisvarat | Kassa | Cash on hand | Kasse |
| ARP | Pankkitili | Bankkonto | Bank account | Bankkonto |
| B | Vastattavaa | Skulder och EK | Equity and liabilities | Passiva |
| BE | Edellisten tilikausien voitto/tappio | Balanserade vinstmedel | Retained earnings | Gewinnvortrag / Verlustvortrag |
| T | Tilikauden tulos | Årets resultat | Profit or loss for the period | Jahresergebnis |
| BS | Velat | Skulder | Liabilities | Verbindlichkeiten |
| BSP | Luottotili | Kreditkonto | Credit facility | Kreditkonto |
| BO | Ostovelat | Leverantörsskulder | Trade payables | Verbindlichkeiten aus Lieferungen |
| BJ | Siirtovelat | Upplupna kostnader | Accruals | Rechnungsabgrenzung (passiv) |
| BL | Arvonlisäverovelka | Momsskuld | VAT payable | USt-Verbindlichkeit |
| BLM | Maksuperusteisen ALV:n kohdentamaton velka | Oallokerad kassamomsskuld | Unallocated cash-basis VAT payable | Nicht zugeordnete Ist-USt-Verbindlichkeit |
| BV | Verovelka | Skatteskuld | Tax payable | Steuerverbindlichkeit |
| BY | Yksityistilit | Privatkonton | Drawings / private accounts | Privatkonten |
| C | Tulot | Intäkter | Income | Erträge |
| CL | Liikevaihtotulo (myynti) | Omsättning | Turnover / sales | Umsatzerlöse |
| CZ | Verottomat tulot | Momsfria intäkter | VAT-exempt income | Steuerfreie Erträge |
| CLZ | Veroton myynti | Momsfri försäljning | VAT-exempt sales | Steuerfreier Umsatz |
| D | Menot | Kostnader | Expenses | Aufwendungen |
| DP | Poistot | Avskrivningar | Depreciation | Abschreibungen |
| DZ | Vähennyskelvottomat menot | Ej avdragsgilla kostnader | Non-deductible expenses | Nicht abzugsfähige Aufwendungen |
| DH | Puoliksi vähennyskelpoiset menot | Delvis avdragsgilla | 50 % deductible expenses | Zur Hälfte abzugsfähig |
| DPZ | Vähennyskelvottomat poistot | Ej avdragsgilla avskrivningar | Non-deductible depreciation | Nicht abzugsfähige Abschreibungen |
| DVE | Ennakkoverot | Förskottsskatt | Prepaid tax | Steuervorauszahlungen |

## Allocation (kohdennus)

| Finnish | Swedish | English | German |
|---------|---------|---------|--------|
| Kohdennus | Dimension / fördelning | Allocation / dimension | Zuordnung / Dimension |
| Kustannuspaikka | Kostnadsställe | Cost centre | Kostenstelle |
| Projekti | Projekt | Project | Projekt |
| Merkkaus / merkkaukset | Märkning | Tag / marking | Kennzeichnung |
| Yleinen | Allmän (ej fördelad) | General (unallocated) | Allgemein (nicht zugeordnet) |
| Jaksotus (date range on a line) | Periodisering | Accrual period | Abgrenzungszeitraum |

## VAT (ALV / arvonlisävero)

| Finnish | Swedish | English | German |
|---------|---------|---------|--------|
| ALV / arvonlisävero | Moms | VAT | Umsatzsteuer (USt) |
| Veroton | Exkl. moms / netto | Net (ex-VAT) | Netto |
| Määrä | Belopp (brutto) | Amount (usually gross) | Betrag (brutto) |
| Verollinen osto (netto) | Beskattat inköp (netto) | Taxable purchase (net method) | Steuerpflichtiger Einkauf (Netto) |
| Verollinen myynti | Beskattad försäljning | Taxable sale | Steuerpflichtiger Verkauf |
| Maksuperusteinen | Kassa-moms | Cash-basis VAT | Ist-Versteuerung |
| Myynti brutto | Försäljning brutto | Gross sales method | Bruttoverkauf |
| Palveluosto EU:n ulkopuolelta | Tjänsteinköp utanför EU | Service purchase outside the EU | Dienstleistungskauf außerhalb der EU |
| Ei ALV-käsittelyä | Ingen momshantering | No VAT treatment | Keine USt-Behandlung |
| ALV-ilmoitus | Momsdeklaration | VAT return | USt-Voranmeldung |
| Maksettava / palautettava | Att betala / att återfå | Payable / refundable | Zahllast / Erstattung |
| ALV-kausi | Momsperiod | VAT period | Voranmeldungszeitraum |

VAT *codes* (11, 21, 28, …) stay numeric in every language. Translate only the
labels. See `docs/DATA_MODEL.md` for the code list actually used in this book.

## Parties

| Finnish | Swedish | English | German |
|---------|---------|---------|--------|
| Kumppani | Motpart | Partner (customer or supplier) | Geschäftspartner |
| Toimittaja | Leverantör | Supplier | Lieferant |
| Asiakas | Kund | Customer | Kunde |
| Viite | Referens / OCR | Payment reference | Verwendungszweck / Referenz |
| Laskupvm | Fakturadatum | Invoice date | Rechnungsdatum |
| Eräpäivä | Förfallodag | Due date | Fälligkeitsdatum |
| Laskutus | Fakturering | Billing | Fakturierung |
| Kierto | Cirkulation / attestflöde | Approval workflow | Freigabelauf |
