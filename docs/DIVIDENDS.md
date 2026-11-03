# Dividends on the company page

How a dividend goes, in the order a year produces it, and what Tilari shows or writes at each step. The rules
behind it are in [DECISIONS.md](DECISIONS.md) (ADR-031); the code is in `frontend/src/book/modules/company/`.

Accounts are those of Kitsas's company chart:

| Account | Name | Used for |
|---|---|---|
| 2251 | Edellisten tilikausien voitto/tappio | The profit the dividend comes from |
| 2261 | Osingonjako | Decided and not yet paid |
| 2921 | Ennakonpidätysvelka | Withheld and not yet remitted |
| 2943 | Voitonjakovelat | A dividend left as a debt to the shareholder |
| 2968 / 1813 | Tuloverosiirtovelat / -saamiset | Income tax left to pay or to get back after the closing |

Withholding follows Vero's guide "Ennakonpidätys osingosta ja Verohallinnolle annettavat ilmoitukset"
(7.12.2022, in force from 1.1.2023).

## Before the meeting

These are rows in the period's documents, not dividend steps:

- The period ends. Kitsas's "Tuloverojen kirjaus" (type 9930) books the income tax on its last day.
- The board signs the financial statements, with its proposal on the profit (board minutes). Whether the
  funds can be distributed (OYL 13:2) is the board's call; Tilari does not check it.
- The tax return 6B is filed.

## The dividend, step by step

Each dividend has a card in the period whose profit it distributes. The five steps of its rail are the ones
marked below.

1. **The general meeting decides.** The annual general meeting, within six months of the period's end, adopts
   the statements and decides the dividend and its payment day. Its minutes are the document.
2. **Book the decision.** "Kirjaa osingonjakopäätös", on the newest ended period: the meeting, its date, the
   amount and the minutes. Tilari writes a draft, D 2251 / C 2261 (type 300), with the minutes attached, and
   links that file to the meeting's row. Until it is posted, the draft shows as "Luonnos" in the section and
   on the row.
3. **Post it** in the voucher editor. The card appears: **Päätetty** (the minutes are filed) and
   **Kirjattu** (the credit on 2261).
4. **Pay.** "Tee maksutosite" on the card, on the payment day: D 2261 for the unpaid amount; for each
   recipient C 2921 for the withholding and C 2943 or a bank account for the net, each line naming the
   recipient. Left as a debt, the voucher needs the loan contract, which the form can attach. Post it:
   **Maksettu**. "Saajat" shows the split, by the shares held on the decision day; the shareholders are kept on
   the company's own card.
5. **Remit the withholding** to Vero by the 12th of the month after the payment. The bank line that pays it
   (D 2921) comes from the bank import: **Pidätys tilitetty**.
6. **Report.** The annual information return on dividends is due by the end of the January after the payment
   year. Its receipt goes on the row "Osinkojen vuosi-ilmoitus": **Ilmoitettu**.

Later bank lines on 2943 repay the debt to the shareholder. They are not a dividend step.

## One meeting, one file

The minutes are the basis of the decision's voucher, and the meeting's document in the period's rows. They are
kept once, on the decision's voucher, and the row links that file:

- Given in the decision form, they are uploaded onto the draft and linked to the row.
- Already stored on a voucher of their own (type 800, linked nowhere else, in an open year), the decision is
  booked on that voucher: it gains the decision's lines and becomes a draft. Nothing is copied.
- Minutes stored elsewhere still count: a dividend is decided when its voucher holds a file, or when its
  meeting's row has minutes on its voucher or dated its day. For the annual meeting, any filed minutes count.

## Extra dividends

An extra dividend is decided by an extraordinary general meeting. Pick "Ylimääräinen yhtiökokous" in the form:
its minutes go to the row "Ylimääräisen yhtiökokouksen pöytäkirja" of the same period, and the dividend gets
its own card, "Lisäosinko". The steps are the same. The row is listed once the period has a document there, a
file named as such a meeting, or a second dividend, which makes it required.

A card's meeting is the row whose minutes sit on its decision voucher or carry its date; otherwise the
period's first dividend is the annual meeting's and later ones extraordinary.

## Income tax after the tax decision

The row "Tuloveron maksu" follows "Verotuspäätös". It reads 2968 (Kitsas's setting `Tuloverosiirtovelat`):
what the period's income tax booking left to pay, and the later lines that settled it, oldest first, whatever
voucher they are on (the payment, or a correction by the tax decision). A refund on 1813
(`Tuloverosiirtosaamiset`) is "Veronpalautus" the same way. A line after the period's end that adds to the
account corrects the last period ended before it. A payment booked only to the tax account (OmaVero) leaves
2968 open until a voucher moves it there.
