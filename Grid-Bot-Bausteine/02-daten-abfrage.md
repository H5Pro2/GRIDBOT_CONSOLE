# 02 Daten-Abfrage

## Ziel

Alle notwendigen Live-Daten fuer die naechste Entscheidung lesen.

## Eingaben

- Boerse
- API Key
- Secret
- Asset
- Quote
- Symbol

## Abfragen

- aktueller Preis
- Asset-Guthaben
- Quote-Guthaben
- offene Spot-Orders

## Pruefung

- Preis ist groesser als `0`.
- Asset-Guthaben ist lesbar.
- Quote-Guthaben ist lesbar.
- offene Spot-Orders sind lesbar.

## Ausgabe

- aktueller Preis
- Asset-Guthaben
- Quote-Guthaben
- Liste offener Spot-Orders
- Fehlergrund, wenn eine Abfrage nicht funktioniert

## Testziel

Die Daten-Abfrage muss einzeln testbar sein, ohne dass Orders gesetzt werden.
