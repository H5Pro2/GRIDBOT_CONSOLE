# 10 Testplan

Jeder Baustein wird einzeln getestet.
Erst wenn ein Baustein stabil ist, wird der naechste Baustein angeschlossen.

## Test 1: Bot-Start

- Pflichtfelder leer: Start blockiert.
- Pflichtfelder gueltig: Start erlaubt.
- Erste Daten-Abfrage wird ausgefuehrt.

## Test 2: Daten-Abfrage

- Preis wird gelesen.
- Asset-Guthaben wird gelesen.
- Quote-Guthaben wird gelesen.
- offene Spot-Orders werden gelesen.
- Fehler wird sichtbar gemeldet.

## Test 3: Grid-Level

- Level werden korrekt berechnet.
- Grid-Abstand ist korrekt.
- ungueltige Grid-Werte blockieren.

## Test 4: Grid erstellen

- Buy-Orders nur unterhalb des Preises.
- Sell-Orders nur oberhalb des Preises.
- Sell-Orders nur bei genug Asset-Guthaben.
- Buy-Orders nur bei genug Quote-Guthaben.
- keine Doppelorders.

## Test 5: Order-Pruefung

- verschwundene Buy-Order wird erkannt.
- Buy-Level wird gesperrt.
- Sell-Folgeorder wird nur einmal gesetzt.
- verschwundene Sell-Order wird erkannt.
- Buy-Level wird wieder freigegeben.

## Test 6: Blockierung

- gesperrtes Buy-Level blockiert neue Buy-Order.
- fehlendes Guthaben blockiert Order.
- vorhandene offene Order blockiert Doppelorder.
- unklare Boersenantwort blockiert Order.
