# 07 Sell-Folgeorder

## Ziel

Nach einer abgeholten Buy-Order wird eine Sell-Order im darueberliegenden Grid-Level gesetzt.

## Eingaben

- abgeholte Buy-Order
- gesperrtes Buy-Level
- Ziel-Level oberhalb
- Asset-Guthaben
- offene Spot-Orders

## Pruefung

- Buy-Order wurde abgeholt.
- Buy-Level ist gesperrt.
- Ziel-Level oberhalb existiert.
- Asset-Guthaben reicht.
- Es gibt noch keine Sell-Order fuer diese Buy-Order.
- Es gibt keine doppelte Sell-Order auf diesem Ziel-Level.

## Aktion

- Sell-Order setzen oder vorbereiten.

## Ausgabe

- Sell-Order gesetzt.
- Oder Sell blockiert mit Grund.

## Testziel

Es darf nur eine Sell-Folgeorder pro abgeholter Buy-Order entstehen.
