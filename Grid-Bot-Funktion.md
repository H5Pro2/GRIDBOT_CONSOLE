# Grid-Bot-Funktion

Dies ist die feste Übersicht für die Grid-Bot-Mechanik.
Die Mechanik wird in einzelne Bausteine getrennt, damit jeder Bereich einzeln geprüft und ausgetauscht werden kann.

## Fester Ablauf

1. Bot-Start: Wenn `Start` gedrückt wird, läuft der Bot im eingestellten Zyklus, z. B. alle `10s`.
2. Jeder Zyklus fragt den aktuellen Preis, offene Phemex-Orders, Quote-Guthaben und Asset-Guthaben ab.
3. Danach wird bestimmt, in welchem Grid-Bereich der aktuelle Preis liegt.
4. Eine Buy-Order darf nur unter dem aktuellen Preis gesetzt werden, wenn keine Sperre besteht, keine gleiche Order offen ist, keine zugehörige Sell-Order offen ist, die 25%-Abstandsregel erfüllt ist und genug Quote-Guthaben vorhanden ist.
5. Wenn eine bekannte Buy-Order verschwunden ist, wird ihr Phemex-Status geprüft.
6. Nur wenn Phemex diese Buy-Order als `Filled` meldet, wird der Buy-Preisbereich gesperrt.
7. Für eine gefüllte Buy-Order wird die Sell-Order im nächsthöheren Grid-Bereich vorbereitet.
8. Die Sell-Order wird nur gesetzt, wenn genug Asset-Guthaben vorhanden ist, dort keine Sell-Order offen ist und die 25%-Abstandsregel erfüllt ist.
9. An einem Sell-Ziel darf keine Buy-Order auf derselben Preisebene erstellt werden.
10. Solange die Sell-Order fehlt, offen ist oder ihr Status unklar ist, bleibt der ursprüngliche Buy-Bereich gesperrt.
11. Erst wenn Phemex die Sell-Order als `Filled` meldet, wird der Buy-Bereich wieder freigegeben.

## Grundprinzip

- Keine Dummy-Daten.
- Keine Testnet-Logik.
- Keine zusätzlichen Börsen oder APIs ohne Vorgabe.
- Keine doppelte Buy-Order.
- Keine doppelte Sell-Order.
- Erst kaufen, dann verkaufen.
- Wenn ein Zustand unklar ist, wird blockiert.

## Konzeptdateien

1. [00 Übersicht](Grid-Bot-Bausteine/00-uebersicht.md)
2. [01 Bot-Start Initialisierung](Grid-Bot-Bausteine/01-bot-start-initialisierung.md)
3. [02 Daten-Abfrage](Grid-Bot-Bausteine/02-daten-abfrage.md)
4. [03 Grid-Level berechnen](Grid-Bot-Bausteine/03-grid-level-berechnen.md)
5. [04 Grid erstellen](Grid-Bot-Bausteine/04-grid-erstellen.md)
6. [05 Order-Prüfung](Grid-Bot-Bausteine/05-order-pruefung.md)
7. [06 Buy-Abholung und Sperre](Grid-Bot-Bausteine/06-buy-abholung-und-sperre.md)
8. [07 Sell-Folgeorder](Grid-Bot-Bausteine/07-sell-folgeorder.md)
9. [08 Sell-Abholung und Freigabe](Grid-Bot-Bausteine/08-sell-abholung-und-freigabe.md)
10. [09 Doppelorder-Blockierung](Grid-Bot-Bausteine/09-doppelorder-blockierung.md)
11. [10 Testplan](Grid-Bot-Bausteine/10-testplan.md)
