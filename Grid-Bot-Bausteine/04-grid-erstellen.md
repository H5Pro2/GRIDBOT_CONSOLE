# 04 Grid erstellen

## Ziel

Beim Erstellen des Grids werden die ersten Buy- und Sell-Orders vorbereitet oder gesetzt.

## Eingaben

- aktueller Preis
- Grid-Level
- Asset-Menge
- Asset-Guthaben
- Quote-Guthaben
- offene Spot-Orders

## Pruefung

- Buy-Level liegen unterhalb des aktuellen Preises.
- Sell-Level liegen oberhalb des aktuellen Preises.
- Fuer ein Level existiert noch keine offene Order.
- Quote-Guthaben reicht fuer Buy-Orders.
- Asset-Guthaben reicht fuer Sell-Orders.

## Aktion

- Buy-Orders unterhalb des Preises setzen, soweit Quote-Guthaben reicht.
- Sell-Orders oberhalb des Preises nur setzen, soweit Asset-Guthaben vorhanden ist.
- Wenn kein Asset-Guthaben vorhanden ist, werden keine Sell-Orders gesetzt.

## Ausgabe

- Meldung: `Grid wurde erstellt`
- Anzahl gesetzter Buy-Orders
- Anzahl gesetzter Sell-Orders
- blockierte Orders mit Grund

## Testziel

Grid erstellen muss ohne Doppelorders und ohne unzureichendes Guthaben funktionieren.
