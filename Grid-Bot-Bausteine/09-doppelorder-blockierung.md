# 09 Doppelorder-Blockierung

## Ziel

Doppelte Orders und Doppelverkaeufe verhindern.

## Eingaben

- geplante Order
- offene Spot-Orders
- bekannte zuletzt gesetzte Orders
- gesperrte Buy-Level

## Pruefung

- Keine offene Order mit gleicher Seite und gleichem Level.
- Keine neue Buy-Order auf gesperrtem Buy-Level.
- Keine zweite Sell-Order fuer dieselbe abgeholte Buy-Order.
- Keine Sell-Order ohne vorher abgeholte Buy-Order.
- Keine Order, wenn offene Orders nicht sicher gelesen wurden.

## Aktion

- Order erlauben.
- Oder Order blockieren.

## Ausgabe

- Erlaubt oder blockiert
- genauer Blockiergrund

## Testziel

Bei jedem unklaren Zustand wird blockiert.
