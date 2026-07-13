# DeepSeek Chat

Una piccola chat web che parla con un modello **DeepSeek** tramite l'**API
ufficiale DeepSeek** ([platform.deepseek.com](https://platform.deepseek.com/)),
compatibile con lo standard OpenAI. Backend Node.js + Express, frontend in
HTML/CSS/JavaScript vanilla. Niente database, niente React, niente Docker.

La API key resta **solo nel backend**: il frontend non la vede mai.

> ℹ️ **Provider.** L'app chiama direttamente `https://api.deepseek.com`. Serve
> quindi una **chiave DeepSeek** (inizia con `sk-...`), *non* una chiave
> OpenRouter (`sk-or-...`): usare una chiave OpenRouter qui — o una chiave
> DeepSeek su OpenRouter — causa un errore `401`.

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

Il modello predefinito è **`deepseek-v4-flash`**. Puoi cambiarlo al volo dal
pannello Impostazioni (es. `deepseek-v4-pro`) oppure impostare un default lato
server con la variabile `DEEPSEEK_MODEL`.

> ⚠️ **Nomi dei modelli.** Sull'API DeepSeek il nome è `deepseek-v4-flash`,
> senza prefisso `deepseek/` e senza suffissi `:free`/`:code` (quelle sono
> convenzioni di OpenRouter). Per sicurezza il server normalizza
> automaticamente i vecchi slug in stile OpenRouter verso il nome nativo, così
> un valore vecchio salvato sul telefono non può più rompere le richieste.

## Requisiti

- Node.js 18 o superiore (usa il `fetch` nativo).

## Avvio in locale

```bash
npm install
export DEEPSEEK_API_KEY="la-tua-chiave"   # inizia con sk-...
# opzionale: export DEEPSEEK_MODEL="deepseek-v4-flash"
npm start
```

Poi apri http://localhost:3000

## Variabili d'ambiente

| Variabile           | Obbligatoria | Default                  |
| ------------------- | ------------ | ------------------------ |
| `DEEPSEEK_API_KEY`  | Sì           | —                        |
| `DEEPSEEK_MODEL`    | No           | `deepseek-v4-flash`      |
| `DEEPSEEK_BASE_URL` | No           | `https://api.deepseek.com` |
| `PORT`              | No           | `3000`                   |

Note:
- In `DEEPSEEK_API_KEY` inserisci solo la chiave (es. `sk-...`), non
  `Bearer sk-...`, senza virgolette o spazi.
- Per compatibilità con i deploy esistenti, se `DEEPSEEK_API_KEY` non è
  impostata il server legge anche `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`. Il
  valore però deve comunque essere una **chiave DeepSeek**, perché le richieste
  vanno all'API DeepSeek.

## Deploy su Render.com

1. Carica questo repository su GitHub.
2. Su [Render](https://render.com/) crea un nuovo **Web Service** e collega il repository GitHub.
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Aggiungi la variabile d'ambiente `DEEPSEEK_API_KEY` con la tua chiave DeepSeek: incolla solo il valore (es. `sk-...`), senza `Bearer`, virgolette o spazi.
6. (Opzionale) aggiungi `DEEPSEEK_MODEL` per scegliere un modello diverso.

Render assegna automaticamente la porta tramite `process.env.PORT`, già gestita dal server.

## API

### `POST /api/chat`

Richiesta:

```json
{
  "messages": [{ "role": "user", "content": "Ciao" }],
  "model": "deepseek-v4-flash"
}
```

Il campo `model` è opzionale: se assente (o non valido) viene usato il default
del server.

Risposta:

```json
{
  "message": "Risposta del modello",
  "model": "deepseek-v4-flash",
  "elapsedMs": 820
}
```

In caso di errore la risposta include informazioni utili per il log
(`error`, `status` upstream, `model`, `elapsedMs`).

## Licenza

MIT
