# SpeedRead Trainer

## Adattamento difficoltà con Elo + margine d'errore

È stato introdotto un modulo dedicato `elo.js` per il calcolo adattivo della difficoltà.

### Modello
- **Utente**: `R_user` (rating), `RD_user` (rating deviation = margine d'errore).
- **Item**: `R_item` calcolato in base a:
  - lunghezza target (`length`),
  - complessità charset (`az`, `AZ`, `n09`, `us`).

### API principali (`elo.js`)
- `normalizeUserRating(raw)`
- `computeItemRating({ length, charset })`
- `expectedScore(R_user, RD_user, R_item)`
- `updateUserRating({ R_user, RD_user, R_item, score })`
- `selectNextItem({ userRating, itemPool })`
- `buildSpanItemPool()`

### Integrazione attuale
Nel flusso **Campo visivo**:
1. Prima di una nuova prova viene scelto un item adattivo (`selectNextItem`).
2. A fine sessione, il rating utente viene aggiornato con `updateUserRating` usando l'accuratezza della sessione come score.
3. `RD_user` rappresenta il margine d'errore e viene conservato nello stato utente (`settings.span.elo`).

## Test unitari
Eseguire:

```bash
node --test elo.test.js
```

I test coprono casi base ed edge:
- default/clamp rating,
- monotonia difficoltà item,
- expected score,
- update rating up/down,
- selezione item con pool vuoto.
