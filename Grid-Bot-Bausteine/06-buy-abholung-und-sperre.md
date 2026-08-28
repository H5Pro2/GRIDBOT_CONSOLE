# 06 Buy-Abholung und Sperre

## Ziel

Wenn eine Buy-Order abgeholt wurde, wird ihr Buy-Level gesperrt.

## Eingaben

- zuletzt bekannte Buy-Order
- offene Spot-Orders
- Asset-Guthaben
- Grid-Level

## Pruefung

- Buy-Order war vorher bekannt.
- Buy-Order ist nicht mehr offen.
- Asset-Guthaben ist vorhanden.
- Das Buy-Level ist noch nicht gesperrt.

## Aktion

- Buy-Level sperren.
- Buy-Order als abgeholt markieren.
- Sell-Folgeorder im naechst hoeheren Grid-Level vorbereiten.

## Ausgabe

- Buy wurde abgeholt.
- Buy-Level ist gesperrt.
- Ziel-Level fuer Sell ist bekannt.

## Testziel

Nach abgeholter Buy-Order darf auf diesem Level keine neue Buy-Order entstehen.
