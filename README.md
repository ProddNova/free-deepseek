# DeepSeek Chat

Una piccola chat web che parla con un modello **DeepSeek** tramite
[OpenRouter](https://openrouter.ai/). Backend Node.js + Express, frontend in
HTML/CSS/JavaScript vanilla. Niente database, niente React, niente Docker.

La API key resta **solo nel backend**: il frontend non la vede mai.

## Funzionalità

- Area messaggi, input, pulsante **Invia** e pulsante **Nuova chat**.
- Indicatore mentre il modello sta rispondendo.
- Cronologia salvata nel browser con `localStorage` (resta dopo il riavvio della pagina).
- Solo gli ultimi 20 messaggi vengono inviati al modello.
- Invio con **Invio**, a capo con **Shift+Invio**.
- Tema scuro, layout responsive, comodo da telefono.

## Requisiti

- Node.js 18 o superiore (usa il `fetch` nativo).

## Avvio in locale

```bash
npm install
export OPENROUTER_API_KEY="la-tua-chiave"
# opzionale: export OPENROUTER_MODEL="deepseek/deepseek-v4-flash"
npm start
```

Poi apri http://localhost:3000

## Variabili d'ambiente

| Variabile             | Obbligatoria | Default                       |
| --------------------- | ------------ | ----------------------------- |
| `OPENROUTER_API_KEY`  | Sì           | —                             |
| `OPENROUTER_MODEL`    | No           | `deepseek/deepseek-v4-flash`  |
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
  "messages": [{ "role": "user", "content": "Ciao" }]
}
```

Risposta:

```json
{
  "message": "Risposta del modello"
}
```

## Licenza

MIT
