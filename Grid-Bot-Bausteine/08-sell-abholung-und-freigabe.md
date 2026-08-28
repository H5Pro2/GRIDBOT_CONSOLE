# 08 Sell-Abholung und Freigabe

## Ziel

Wenn eine Sell-Order verkauft wurde, wird das zugehoerige Buy-Level wieder freigegeben.

## Eingaben

- bekannte Sell-Order
- offene Spot-Orders
- Quote-Guthaben
- gesperrtes Buy-Level

## Pruefung

- Sell-Order war vorher bekannt.
- Sell-Order ist nicht mehr offen.
- Quote-Guthaben ist vorhanden.
- Sell-Order gehoert zu einem gesperrten Buy-Level.

## Aktion

- Buy-Level freigeben.
- Neue Buy-Order auf diesem Level pruefen.

## Ausgabe

- Sell wurde verkauft.
- Buy-Level wurde freigegeben.
- Neue Buy-Order erlaubt oder blockiert.

## Testziel

Ein Buy-Level darf erst nach verkauftem Sell wieder freigegeben werden.
