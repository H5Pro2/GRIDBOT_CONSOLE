# Grid-Bot-Funktion

Dies ist die Uebersicht fuer die Grid-Bot-Mechanik.
Die Mechanik wird zuerst nur konzeptionell als einzelne Dateien entworfen.
Danach wird Baustein fuer Baustein programmiert und einzeln getestet.

## Grundprinzip

- Einfacher Grid Bot.
- Keine Dummy-Daten.
- Keine Testnet-Logik.
- Keine zusaetzlichen Boersen oder APIs ohne Vorgabe.
- Keine doppelte Buy-Order.
- Keine doppelte Sell-Order.
- Erst kaufen, dann verkaufen.
- Ein Buy-Level bleibt gesperrt, bis die passende Sell-Order verkauft wurde.
- Wenn ein Zustand unklar ist, wird blockiert.

## Konzeptdateien

1. [00 Uebersicht](Grid-Bot-Bausteine/00-uebersicht.md)
2. [01 Bot-Start Initialisierung](Grid-Bot-Bausteine/01-bot-start-initialisierung.md)
3. [02 Daten-Abfrage](Grid-Bot-Bausteine/02-daten-abfrage.md)
4. [03 Grid-Level berechnen](Grid-Bot-Bausteine/03-grid-level-berechnen.md)
5. [04 Grid erstellen](Grid-Bot-Bausteine/04-grid-erstellen.md)
6. [05 Order-Pruefung](Grid-Bot-Bausteine/05-order-pruefung.md)
7. [06 Buy-Abholung und Sperre](Grid-Bot-Bausteine/06-buy-abholung-und-sperre.md)
8. [07 Sell-Folgeorder](Grid-Bot-Bausteine/07-sell-folgeorder.md)
9. [08 Sell-Abholung und Freigabe](Grid-Bot-Bausteine/08-sell-abholung-und-freigabe.md)
10. [09 Doppelorder-Blockierung](Grid-Bot-Bausteine/09-doppelorder-blockierung.md)
11. [10 Testplan](Grid-Bot-Bausteine/10-testplan.md)

## Reihenfolge fuer spaetere Programmierung

1. Bot-Start Initialisierung
2. Daten-Abfrage
3. Grid-Level berechnen
4. Grid erstellen
5. Order-Pruefung
6. Buy-Abholung und Sperre
7. Sell-Folgeorder
8. Sell-Abholung und Freigabe
9. Doppelorder-Blockierung

Jeder Baustein wird erst einzeln getestet, bevor der naechste Baustein angeschlossen wird.
