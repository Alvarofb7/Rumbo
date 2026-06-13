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

La app usa Leaflet con teselas CARTO Voyager sobre OpenStreetMap para un aspecto más suave, parecido a Apple Maps. Usar Apple Maps real requeriría integrar MapKit JS y generar un token desde Apple Developer.

## Variables

Consulta `.env.example`. Las claves de Google Maps, Tripadvisor e Instagram están preparadas como integraciones futuras; la versión inicial no hace scraping y guarda esas URLs como fuentes editables.
