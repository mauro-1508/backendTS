# Guía rápida del backend de **Traduce Señas**
## Express + PostgreSQL + Docker

Esta guía resume **todo lo que hemos montado** hasta ahora en el backend para que el equipo lo entienda y lo replique más rápido.

---

## 1. ¿Qué estamos construyendo?

Estamos creando el **backend** del proyecto.  
Ese backend será el encargado de:

- recibir peticiones del frontend
- procesar la lógica del sistema
- conectarse a PostgreSQL
- responder en formato JSON
- manejar autenticación
- exponer endpoints como `register`, `login`, `profile`, etc.

En este momento empezamos por el módulo de **auth**, con los endpoints:

- `POST /api/auth/register`
- `POST /api/auth/login`

---

## 2. Estructura recomendada del backend

La estructura base que organizamos es esta:

```bash
backend/
├── src/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   └── auth.controller.js
│   ├── repositories/
│   │   └── auth.repository.js
│   ├── routes/
│   │   └── auth.routes.js
│   ├── services/
│   │   └── auth.service.js
│   └── app.js
├── .env
├── package.json
└── server.js
```

### Qué hace cada carpeta

#### `config/`
Aquí va la configuración general del backend.  
Por ejemplo, la conexión con la base de datos.

#### `controllers/`
Reciben la petición HTTP (`req`), llaman al servicio y devuelven la respuesta (`res`).

#### `services/`
Aquí va la lógica de negocio.  
Por ejemplo:

- validar datos
- verificar si un correo ya existe
- encriptar contraseña
- generar token

#### `repositories/`
Aquí van las consultas SQL a la base de datos.

#### `routes/`
Aquí definimos las rutas o endpoints.

#### `app.js`
Configura Express, middlewares y rutas.

#### `server.js`
Levanta el servidor.

---

## 3. Flujo de trabajo de un endpoint

La lógica del backend sigue este flujo:

```bash
Ruta -> Controller -> Service -> Repository -> Base de datos
```

### Ejemplo con `register`

#### Ruta
Recibe la URL:

```http
POST /api/auth/register
```

#### Controller
Toma los datos que llegan por `req.body`.

#### Service
Valida y aplica reglas de negocio.

#### Repository
Hace el `INSERT` o el `SELECT` a PostgreSQL.

#### Base de datos
Guarda o consulta la información.

---

## 4. Qué es Express y para qué lo usamos

**Express** es un framework de Node.js para crear servidores y APIs de forma más sencilla.

Nos sirve para:

- crear endpoints
- manejar peticiones y respuestas
- organizar rutas
- usar middlewares
- construir una API REST

Ejemplo básico:

```js
const express = require('express');

const app = express();

app.use(express.json());

app.get('/hola', (req, res) => {
  res.json({ mensaje: 'Hola mundo' });
});
```

---

## 5. Paquetes que instalamos en el backend

Dentro de la carpeta `backend` se deben instalar estos paquetes:

```bash
npm init -y
npm install express pg bcrypt jsonwebtoken dotenv
npm install -D nodemon
```

### Qué hace cada uno

#### `express`
Framework para crear el servidor y los endpoints.

#### `pg`
Cliente de PostgreSQL para Node.js.

#### `bcrypt`
Sirve para encriptar contraseñas.

#### `jsonwebtoken`
Sirve para generar tokens JWT.

#### `dotenv`
Carga las variables del archivo `.env`.

#### `nodemon`
Reinicia el servidor automáticamente cuando cambias archivos.

---

## 6. Archivo `.env`

El archivo `.env` va en la **raíz del backend**:

```bash
backend/.env
```

Ejemplo:

```env
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=Camilofierro2007!
DB_NAME=traduce_senas
JWT_SECRET=mi_clave_secreta
PORT=3000
```

### Para qué sirve
Sirve para guardar:

- datos de conexión a la base de datos
- puerto del backend
- claves sensibles como JWT secret

### Importante
Este archivo **no debe subirse a GitHub**.  
Por eso en `.gitignore` se agrega:

```gitignore
.env
node_modules
```

---

## 7. Crear el contenedor de PostgreSQL en Docker

Como necesitábamos una base de datos local, montamos PostgreSQL con Docker.

### Comando recomendado

```bash
docker run --name postgres-container -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=Camilofierro2007! -e POSTGRES_DB=traduce_senas -p 5433:5432 -v postgres_data:/var/lib/postgresql/data -d postgres:16
```

### Qué significa

- `--name postgres-container`  
  Nombre del contenedor

- `-e POSTGRES_USER=postgres`  
  Usuario de la base

- `-e POSTGRES_PASSWORD=...`  
  Contraseña de la base

- `-e POSTGRES_DB=traduce_senas`  
  Nombre de la base de datos

- `-p 5433:5432`  
  Puerto local `5433` conectado al `5432` del contenedor

- `-v postgres_data:/var/lib/postgresql/data`  
  Volumen para persistir la información

- `-d postgres:16`  
  Imagen de PostgreSQL versión 16 corriendo en segundo plano

### Por qué usamos `5433` y no `5432`
Porque ya había otro contenedor o servicio usando `5432`, y eso causaba conflicto de puertos.

---

## 8. Comandos útiles de Docker

### Ver contenedores activos
```bash
docker ps
```

### Ver todos los contenedores
```bash
docker ps -a
```

### Detener el contenedor
```bash
docker stop postgres-container
```

### Iniciar el contenedor
```bash
docker start postgres-container
```

### Eliminar el contenedor
```bash
docker rm -f postgres-container
```

### Ver logs del contenedor
```bash
docker logs postgres-container
```

### Eliminar el volumen
```bash
docker volume rm postgres_data
```

---

## 9. Conexión a PostgreSQL desde el backend

En `src/config/db.js` dejamos la conexión así:

```js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = pool;
```

### Para qué sirve `Pool`
`Pool` administra conexiones a PostgreSQL y permite usar:

```js
pool.query(...)
```

en los repositories.

---

## 10. Archivo `server.js`

`server.js` es el archivo que arranca el servidor.

Ejemplo:

```js
require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
```

### Qué hace
- carga el `.env`
- importa la app de Express
- levanta el servidor

---

## 11. Archivo `app.js`

Aquí configuramos Express y las rutas.

```js
const express = require('express');
const authRoutes = require('./routes/auth.routes');

const app = express();

app.use(express.json());
app.use('/api/auth', authRoutes);

module.exports = app;
```

### Qué hace
- crea la aplicación Express
- activa lectura de JSON
- conecta el módulo de rutas de auth

---

## 12. Módulo Auth

El primer módulo que montamos fue **auth**.

### Endpoints iniciales

```http
POST /api/auth/register
POST /api/auth/login
```

---

## 13. Archivo `auth.routes.js`

```js
const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;
```

### Qué hace
Conecta los endpoints con el controller.

---

## 14. Archivo `auth.controller.js`

```js
const authService = require('../services/auth.service');

const authController = {
  register: async (req, res) => {
    try {
      const { nombre, email, password } = req.body;

      const result = await authService.register({
        nombre,
        email,
        password,
      });

      return res.status(201).json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Error interno del servidor',
      });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await authService.login({
        email,
        password,
      });

      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Error interno del servidor',
      });
    }
  },
};

module.exports = authController;
```

### Qué hace
- recibe los datos del frontend
- llama al service
- devuelve respuesta JSON
- maneja errores

---

## 15. Archivo `auth.service.js`

```js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRepository = require('../repositories/auth.repository');

const authService = {
  register: async ({ nombre, email, password }) => {
    if (!nombre || !email || !password) {
      throw new Error('Nombre, email y contraseña son obligatorios');
    }

    const existingUser = await authRepository.findUserByEmail(email);

    if (existingUser) {
      throw new Error('Ya existe un usuario con ese correo');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await authRepository.createUser({
      nombre,
      email,
      password: hashedPassword,
    });

    return {
      success: true,
      message: 'Usuario registrado correctamente',
      data: newUser,
    };
  },

  login: async ({ email, password }) => {
    if (!email || !password) {
      throw new Error('Email y contraseña son obligatorios');
    }

    const user = await authRepository.findUserByEmail(email);

    if (!user) {
      throw new Error('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error('Credenciales inválidas');
    }

    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return {
      success: true,
      message: 'Inicio de sesión exitoso',
      data: {
        token,
        user: {
          user_id: user.user_id,
          nombre: user.nombre,
          email: user.email,
        },
      },
    };
  },
};

module.exports = authService;
```

### Qué hace
Aquí va la lógica real:

- valida datos
- revisa si el usuario existe
- encripta contraseña
- compara contraseña
- genera token JWT

---

## 16. Archivo `auth.repository.js`

Este archivo hace consultas SQL.

Ejemplo base:

```js
const pool = require('../config/db');

const authRepository = {
  findUserByEmail: async (email) => {
    const query = `
      SELECT id, name, email, password
      FROM users
      WHERE email = $1
      LIMIT 1
    `;

    const { rows } = await pool.query(query, [email]);
    return rows[0];
  },

  createUser: async ({ nombre, email, password }) => {
    const query = `
      INSERT INTO users (name, email, password, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, name, email, created_at
    `;

    const values = [nombre, email, password];

    const { rows } = await pool.query(query, values);
    return rows[0];
  },
};

module.exports = authRepository;
```

### Qué hace
- busca usuario por email
- crea usuario nuevo
- ejecuta SQL con `pool.query`

### Importante
Aquí hay que tener cuidado con los nombres reales de la base de datos:

- nombre de la tabla
- nombre de columnas
- tipos de datos

Si la BD tiene nombres en inglés, el repository debe usar esos mismos nombres.

---

## 17. Tabla ejemplo para usuarios

Ejemplo de tabla en PostgreSQL:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 18. Cómo probar el endpoint `register`

### URL
```http
POST http://localhost:3000/api/auth/register
```

### Body JSON
```json
{
  "nombre": "Mauricio",
  "email": "mauricio@gmail.com",
  "password": "12345678"
}
```

### Qué debería pasar
Si todo está bien:
- llega al controller
- pasa por el service
- consulta la BD desde el repository
- guarda el usuario
- responde con JSON

---

## 19. Problemas que encontramos y qué significaban

### Error: `Cannot find module 'dotenv'`
Significaba que faltaba instalar el paquete.

Solución:

```bash
npm install dotenv
```

---

### Error: `Cannot find module './routes/auth.routes'`
La ruta del archivo estaba mal escrita o el archivo no estaba donde Express lo buscaba.

---

### Error con `./app`
`server.js` estaba apuntando a una ruta incorrecta.  
Se corrigió importando correctamente `./src/app`.

---

### Thunder Client: `Invalid URL`
La URL estaba mal escrita porque se puso `POST` dentro del campo de la URL.

Correcto:

```http
http://localhost:3000/api/auth/register
```

---

### Docker: conflicto de puerto
Ya había algo usando `5432`, por eso se cambió a `5433`.

---

### Docker: contenedor se apagaba enseguida
El volumen tenía datos viejos incompatibles con la imagen nueva.  
Se resolvió:

- borrando el contenedor
- borrando el volumen
- usando `postgres:16`

---

## 20. Recomendaciones para el equipo

### 1. No mezclar nombres de columnas
Si la BD está en inglés, el backend debe consultar en inglés.

### 2. Mantener la arquitectura por capas
No meter SQL dentro del controller.

### 3. Probar endpoint por endpoint
Primero `register`, luego `login`, luego `profile`.

### 4. Definir bien la tabla `users`
Antes de seguir con más endpoints, todos deben estar de acuerdo en:

- tabla
- columnas
- relaciones
- tipos de datos

### 5. Usar `.env`
Nunca dejar credenciales quemadas en el código.

---

## 21. Próximos pasos

Después de `register` y `login`, lo siguiente recomendable es:

- `GET /api/profile`
- middleware para validar JWT
- terminar la tabla de usuarios
- conectar más módulos:
  - historial
  - traducción
  - notificaciones
  - léxico

---

## 22. Resumen final

Lo que ya se hizo conceptualmente fue:

- organizar el backend por capas
- instalar Express y librerías necesarias
- crear estructura base
- montar PostgreSQL en Docker
- configurar `.env`
- crear conexión con `pg`
- levantar servidor
- crear primeros endpoints de auth
- entender el flujo:
  - ruta
  - controller
  - service
  - repository
  - base de datos

---

## 23. Comandos clave resumidos

### Instalar dependencias
```bash
npm init -y
npm install express pg bcrypt jsonwebtoken dotenv
npm install -D nodemon
```

### Correr backend
```bash
node server.js
```

### Crear contenedor PostgreSQL
```bash
docker run --name postgres-container -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=Camilofierro2007! -e POSTGRES_DB=traduce_senas -p 5433:5432 -v postgres_data:/var/lib/postgresql/data -d postgres:16
```

### Ver contenedor
```bash
docker ps
```

### Detener contenedor
```bash
docker stop postgres-container
```

### Iniciar contenedor
```bash
docker start postgres-container
```



Este archivo puede servir como base para que todo el equipo monte el backend más rápido y entienda qué hace cada parte.

###agregaciones sin meter:
- agregar
 el middaleware de autenticación, para que primero se enfoque en la lógica de negocio y la conexión con la base de datos. Luego, una vez que los endpoints básicos estén funcionando, se puede agregar el middleware de autenticación para proteger las rutas.

- agregar 
el endpoint de perfil (`GET /api/profile`) después de tener `register` y `login` funcionando, para que el equipo pueda enfocarse en una cosa a la vez y entender bien cada parte antes de avanzar a la siguiente.

- agregar
la intalacion de nodemailer y la configuración del servicio de correo para enviar notificaciones, ya que eso puede ser un poco más complejo y es mejor abordarlo después de tener la base del backend funcionando correctamente.

---