# 05 Order-Pruefung

## Ziel

Alle `Grid-Abfragezeit` Sekunden wird geprueft, was passiert ist und welche naechste Aktion erlaubt ist.

## Eingaben

- aktueller Preis
- Asset-Guthaben
- Quote-Guthaben
- offene Spot-Orders
- Grid-Level
- zuletzt bekannte Orders
- gesperrte Buy-Level

## Pruefung

- Welche Orders sind noch offen?
- Welche Orders sind verschwunden?
- Wurde eine Buy-Order abgeholt?
- Wurde eine Sell-Order abgeholt?
- Wo liegt der aktuelle Preis?
- Gibt es genug Guthaben fuer die naechste Aktion?
- Ist das betroffene Level gesperrt?
- Gibt es bereits eine offene Order auf dem Level?

## Aktion

- Bei abgeholter Buy-Order: Buy-Level sperren und Sell-Folgeorder pruefen.
- Bei abgeholter Sell-Order: Buy-Level freigeben und neue Buy-Order pruefen.
- Bei fehlender Buy-Order: nur nachsetzen, wenn Level frei und Quote-Guthaben ausreichend ist.
- Bei fehlender Sell-Order: nur setzen, wenn vorher Buy abgeholt wurde und Asset-Guthaben reicht.

## Ausgabe

- erkannte Veraenderungen
- gesetzte Orders
- blockierte Aktionen
- aktualisierte Sperren

## Testziel

Die Order-Pruefung entscheidet nur anhand von Preis, Guthaben, offenen Orders und Sperren.
