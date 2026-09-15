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
- Historische Kaufpreise anderer Zyklen sperren keine freien Sell-Level. Tatsächlich offene Börsenorders und bereits zugeordnete Sell-Ziele bleiben dagegen belegt.
- Diese Unterscheidung gilt auch beim Anheben eines überholten Sell-Ziels und beim Verkauf freien Start-Assets. Preisabstand, verfügbare Menge und bestehende Verkaufszuordnungen bleiben geschützt.

## Aktion

- Sell-Order setzen oder vorbereiten.

## Ausgabe

- Sell-Order gesetzt.
- Oder Sell blockiert mit Grund.

## Testziel

Es darf nur eine Sell-Folgeorder pro abgeholter Buy-Order entstehen.
