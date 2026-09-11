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

- Bei bestätigter Buy-Ausführung: den Kaufzyklus anhand der Order-ID führen und die Sell-Folgeorder prüfen.
- Bei bestätigter Sell-Ausführung: nur den zugehörigen Kaufzyklus abschließen.
- Bei fehlender Buy-Order: bei freiem Börsenlevel, ausreichenden freien USDT und erfüllter 25%-Abstandsregel nachsetzen, unabhängig von alten Zyklussperren. Offene Orders und freie USDT werden unmittelbar vor dem Senden erneut geprüft; bereits geplante Ausgaben werden reserviert.
- Bei fehlender Sell-Order: nur setzen, wenn vorher Buy abgeholt wurde und Asset-Guthaben reicht.

## Mindestmenge offener Orders

- Eine Order am gleichen Preislevel und auf derselben Seite belegt das Level unabhängig von ihrer Menge. Auch manuell gesetzte Orders werden berücksichtigt.
- Die ursprüngliche Bestellmenge zählt, nicht die Restmenge nach einer Teilfüllung. Gleich große oder größere Orders bleiben unverändert.
- Kleinere, noch nicht ausgeführte Limit-Orders werden nur bei ausreichendem freien Guthaben für die Mehrmenge ersetzt. Bei Buy-Orders zählt Quote-Guthaben, bei Sell-Orders freies Asset.
- Vor dem Löschen werden Order-ID, Preis, Seite, Menge, Ausführungsstatus und Preisabstand erneut geprüft. Erst nach bestätigter Stornierung ohne Teilfüllung folgt eine neue Order am selben Preis mit der eingestellten Menge.
- Vor der Neuerstellung müssen die gesamte benötigte Summe und der bestehende Mindestpreisabstand von 25 Prozent eines Grid-Abstands erneut erfüllt sein.
- Offene Ersatzvorgänge werden lokal in `data/order-size-replacements/` gespeichert. Bei unklarer Stornierung oder unbestätigter Neuerstellung pausieren weitere Handelsaktionen für dieses Symbol. Der Debug-Bereich nennt den Grund. Eine unklare Neuerstellung wird nur abgefragt, nicht blind wiederholt.
- Teilfüllungen während der Stornierung benötigen eine Prüfung des Börsenstatus; es wird keine zusätzliche Order erzeugt. Mehrere bestehende Orders auf demselben Level werden nicht automatisch verändert.
- Die Verknüpfung einer Sell-Order mit ihrem gesperrten Buy-Level bleibt beim Ersatz erhalten. Nach Ausführung einer größeren Buy-Order verwendet die Folgeorder die von der Börse bestätigte Menge.

## Ausgabe

- erkannte Veraenderungen
- gesetzte Orders
- blockierte Aktionen
- aktualisierte Sperren

## Testziel

Alte Zyklussperren blockieren kein freies Buy-Level. Preisabstand, verfügbare USDT, aktuelle Börsenorders und ungeklärte Orderübermittlungen werden weiterhin geprüft. Neue Käufe behalten eigene IDs und überschreiben keine alten Zyklen.
