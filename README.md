# SpeedRead Trainer

## Adaptive difficulty

L'app ora usa due modelli:

- **Campo Visivo**: stage rigidi (nessuna scelta utente su charset/difficoltà).
- **Lettura veloce** e **Punti di fissità**: adattamento automatico con modello **Glicko-lite** (rating + incertezza).

## Campo Visivo

- Stage 1: numeri `0-9`
- Stage 2: numeri + `A-Z` senza `O`
- Stage 3: numeri + `A-Z` (senza `O`) + `a-z` (senza `o`)
- Stage 4: stage 3 + speciali `. , ; : ! ? - _ ( ) [ ] { } / \ @ # $ % & * + =`

Regole:
- start `L=4`, min `4`, max `14`
- `+1` dopo 3 successi consecutivi
- `-1` dopo errore
- cooldown di 1 tentativo dopo ogni cambio lunghezza
- promozione stage con doppia streak a `L>=10`, buffer `L-2`

## Profili salvati

Lo stato è salvato in `localStorage` sotto `speedread_trainer_v2_state`, nel profilo utente:

- `settings.span.profile` (stage/length/best/rolling)
- `settings.reader.profile` (Glicko-lite + currentParams/best)
- `settings.fixation.profile` (Glicko-lite + currentParams/best)

## Test

```bash
node --test visual-span.test.js adaptive-glicko.test.js elo.test.js
```
