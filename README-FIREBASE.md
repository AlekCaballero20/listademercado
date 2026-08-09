# Market Checklist · Firebase

Esta versión guarda la información en Cloud Firestore, en un único documento compartido:

`marketChecklist/main`

## Activación necesaria

1. En Firebase Console, activa **Authentication > Sign-in method > Google**.
2. En Authentication, agrega el dominio donde publiques la app, por ejemplo GitHub Pages.
3. En Firestore, crea la base de datos si aún no existe.
4. Publica las reglas de `firestore.rules`.
5. Abre la app e inicia sesión con una de estas cuentas:
   - alekcaballeromusic@gmail.com
   - catalina.medina.leal@gmail.com

## Qué cambió

- Se eliminó el guardado manual en `localStorage`.
- El estado se sincroniza con Firestore en tiempo real.
- Al agregar un producto ya puedes poner el precio base de una vez.
- El carrito usa el último precio conocido o el precio base como sugerencia.
- Puedes compartir el carrito como texto o abrir una versión imprimible para guardarla como PDF, sin afectar precios, historial ni compras.
- Al guardar una compra, se actualizan últimos precios, tienda e historial.
- Nuevo: **Importar factura con IA**. La app genera un prompt con tu catálogo actual; se lo pasas a cualquier IA junto con la factura, pegas el JSON que devuelve y la app concilia línea por línea ("así aparece en la factura → así se guarda en la app"), llena el carrito con nombres, cantidades y precios, y opcionalmente registra la compra.

## Nota técnica

La app sigue siendo estática y puede correr en GitHub Pages. Usa los módulos web de Firebase desde CDN, así que no necesita `npm install` ni Vite para funcionar.
