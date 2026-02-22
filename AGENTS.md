# AGENTS.md

## Campo Visivo – Spec
- L'esercizio **Campo Visivo** non espone selezioni manuali del charset (nessun toggle numeri/lettere/simboli).
- Progressione fissa a stage:
  1. numeri `0-9`
  2. numeri + `A-Z` senza `O`
  3. numeri + `A-Z` (senza `O`) + `a-z` (senza `o`)
  4. stage 3 + speciali stabili: `. , ; : ! ? - _ ( ) [ ] { } / \ @ # $ % & * + =`
- Lunghezza iniziale `L=4`, min `4`, max `14`.
- Aumenta di `+1` dopo 3 successi consecutivi; su errore `-1` (min 4).
- Cooldown: dopo un cambio di lunghezza, non cambiare di nuovo per 1 tentativo.
- Promozione stage: con `L>=10`, due volte consecutive il raggiungimento della streak da 3 a `L=10+`.
- Cambio stage: `L = max(4, L-2)`.
- Persistenza livello utente (profilo Campo Visivo):
  - `currentStage`, `currentLength`, `bestStageReached`, `bestLengthReached`, `lastSessionAt`, `rollingResults` (ultimi 10).
- Alla nuova sessione si riparte da `currentStage/currentLength` salvati.
- Architettura: separare generator / evaluator / progression / persistence in funzioni testabili senza dipendenze UI.
