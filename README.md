# DeepSeek Chat

Una piccola chat web che parla con un modello **DeepSeek** tramite
[OpenRouter](https://openrouter.ai/). Backend Node.js + Express, frontend in
HTML/CSS/JavaScript vanilla. Niente database, niente React, niente Docker.

La API key resta **solo nel backend**: il frontend non la vede mai.

## Funzionalità

- Interfaccia **ottimizzata per mobile** (iPhone): rispetta la safe-area di
  notch/Dynamic Island e home indicator, target touch ampi, niente zoom
  automatico sull'input.
- **Pannello Impostazioni** per scegliere il modello (lista di modelli DeepSeek
  + slug personalizzato). La scelta è salvata sul telefono.
- **Finestra Log** con la diagnostica di ogni chiamata API: modello usato, stato
  HTTP, codice upstream, tempi di risposta ed eventuali errori.
- Indicatore animato mentre il modello sta rispondendo.
- Cronologia salvata nel browser con `localStorage` (resta dopo il riavvio della pagina).
- Solo gli ultimi 20 messaggi vengono inviati al modello.
- Invio con **Invio**, a capo con **Shift+Invio**.
- Tema scuro.

## Modello

Il modello predefinito è **`deepseek/deepseek-v4-flash:code`** (la variante
gratuita "code" di DeepSeek V4 Flash su OpenRouter). Puoi cambiarlo al volo dal
pannello Impostazioni oppure impostare un default lato server con la variabile
`OPENROUTER_MODEL`.

## Requisiti

- Node.js 18 o superiore (usa il `fetch` nativo).

## Avvio in locale

```bash
npm install
export OPENROUTER_API_KEY="la-tua-chiave"
# opzionale: export OPENROUTER_MODEL="deepseek/deepseek-v4-flash:code"
npm start
```

Poi apri http://localhost:3000

## Variabili d'ambiente

| Variabile             | Obbligatoria | Default                       |
| --------------------- | ------------ | ----------------------------- |
| `OPENROUTER_API_KEY`  | Sì           | —                             |
| `OPENROUTER_MODEL`    | No           | `deepseek/deepseek-v4-flash:code` |
| `PORT`                | No           | `3000`                        |

## Deploy su Render.com

1. Carica questo repository su GitHub.
2. Su [Render](https://render.com/) crea un nuovo **Web Service** e collega il repository GitHub.
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Aggiungi la variabile d'ambiente `OPENROUTER_API_KEY` con la tua chiave.
6. (Opzionale) aggiungi `OPENROUTER_MODEL` per scegliere un modello diverso.

Render assegna automaticamente la porta tramite `process.env.PORT`, già gestita dal server.

## API

### `POST /api/chat`

Richiesta:

```json
{
  "messages": [{ "role": "user", "content": "Ciao" }],
  "model": "deepseek/deepseek-v4-flash:code"
}
```

Il campo `model` è opzionale: se assente (o non valido) viene usato il default
del server.

Risposta:

```json
{
  "message": "Risposta del modello",
  "model": "deepseek/deepseek-v4-flash:code",
  "elapsedMs": 820
}
```

In caso di errore la risposta include informazioni utili per il log
(`error`, `status` upstream, `model`, `elapsedMs`).

## Licenza

MIT
