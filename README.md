# SpeedRead Trainer

## Campo Visivo (standardizzato)

L'esercizio **Campo Visivo** ora è completamente automatico: l'utente non sceglie più set di caratteri o lunghezza.

### Progressione
- Stage 1: numeri `0-9`
- Stage 2: numeri + maiuscole `A-Z` senza `O`
- Stage 3: numeri + maiuscole (senza `O`) + minuscole (senza `o`)
- Stage 4: stage 3 + speciali `. , ; : ! ? - _ ( ) [ ] { } / \ @ # $ % & * + =`

Regole lunghezza:
- start `L=4`, min `4`, max `14`
- `+1` dopo 3 successi consecutivi
- `-1` dopo errore
- cooldown di 1 tentativo dopo ogni cambio lunghezza

Promozione stage:
- quando `L>=10` servono 2 streak consecutive da 3 successi
- al cambio stage: `L = max(4, L-2)`

## Persistenza stato Campo Visivo

Lo stato è salvato nel profilo utente in `localStorage` (`APP_KEY = speedread_trainer_v2_state`), dentro `settings.span.profile`:
- `currentStage`
- `currentLength`
- `bestStageReached`
- `bestLengthReached`
- `lastSessionAt`
- `rollingResults` (ultimi 10 tentativi)

Alla sessione successiva, la ripartenza usa `currentStage/currentLength` salvati.

## Test unitari

```bash
node --test elo.test.js visual-span.test.js
```

`visual-span.test.js` copre casi base/edge di:
- charset per stage
- generatore stringa
- evaluator
- progressione lunghezza e promozione stage
