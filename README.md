# Rumbo

Rumbo es una PWA personal para guardar lugares en un mapa, clasificar recomendaciones y decidir qué visitar después. Está pensada mobile-first para instalarla en iPhone desde Safari como app de inicio.

## Stack

- React con JavaScript y Vite
- Material UI
- Leaflet + OpenStreetMap
- Firebase Auth + Firestore cuando configures las claves
- Fallback local en `localStorage` para probar sin Firebase

## Primer arranque

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## Firebase

1. Crea un proyecto en Firebase.
2. Activa Authentication con Email/Password y Google.
3. Crea Firestore Database.
4. Copia los datos de la web app en `.env`.
5. Publica las reglas de `firestore.rules` y `storage.rules`.

Mientras `.env` no tenga claves de Firebase, la app funciona en modo local para que puedas probar diseño, CRUD, filtros y bandeja.

## iPhone y ubicación real

Safari solo entrega ubicación precisa a webs en contexto seguro. En local, `localhost` funciona en el Mac, pero desde el iPhone entrando por `http://192.168...` puede bloquear GPS. Para probar ubicación real en el iPhone:

1. Despliega la app en un dominio HTTPS, por ejemplo Firebase Hosting, Vercel o Netlify.
2. Abre esa URL HTTPS en Safari.
3. Acepta el permiso de ubicación.
4. Usa Compartir → Añadir a pantalla de inicio.

Mientras estés en la URL local, puedes usar la búsqueda para mover el mapa y fijar una zona como referencia de cercanía.

## Mapa

La app usa Leaflet con teselas OpenStreetMap y una capa visual suavizada para mantener nombres locales como `Sevilla`. La atribución de OpenStreetMap debe mantenerse por licencia, aunque se muestra de forma discreta en la interfaz. Usar Apple Maps real requiere MapKit JS, un Maps ID y una clave/token desde Apple Developer.

## Importación de lugares

El importador intenta resolver enlaces por este orden:

1. Coordenadas explícitas del enlace, si existen.
2. Tripadvisor Content API si defines `TRIPADVISOR_API_KEY`.
3. Google Places Text Search si defines `GOOGLE_PLACES_API_KEY`.
4. Fallbacks verificados para enlaces problemáticos conocidos.
5. Páginas públicas legibles y geocoding con OpenStreetMap como fallback.

Para máxima precisión en restaurantes y bares, configura `GOOGLE_PLACES_API_KEY` en Vercel como variable server-only.

## Variables

Consulta `.env.example`. No uses prefijo `VITE_` para claves privadas de Google Places o Tripadvisor: las variables sin `VITE_` solo las lee la API serverless.
