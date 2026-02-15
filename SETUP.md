# 🚀 Пошаговая инструкция

## ШАГ 1: MongoDB Atlas

### 1.1 Регистрация и создание кластера

1. Открой [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Зарегистрируйся (можно через Google)
3. **Create Free Cluster**
4. Настройки:
   - Provider: **AWS**
   - Region: **US East (N. Virginia)**
   - Tier: **M0 Sandbox (FREE)**
5. Нажми **Create**
6. ⏳ Подожди 2-3 минуты

### 1.2 Создание пользователя

Появится окно **"Connect to Cluster0"**:

1. Секция **"Create a database user"**:
   - Username: автоматически (скопируй!)
   - Password: нажми кнопку Copy (СОХРАНИ!)
   - Нажми **Create Database User** (внизу)

### 1.3 Получение строки подключения

1. После создания пользователя нажми **Choose a connection method**
2. Выбери **Drivers**
3. Driver: **Node.js**, Version: **6.7 or later**
4. Скопируй строку подключения

**У тебя будет:**
```
mongodb+srv://mirgorodskiivadim_db_user:FWKtnxXvzqVbhFQC@cluster0.x0jthp4.mongodb.net/?appName=Cluster0
```

**Нужно добавить `/analytics` перед `?`:**
```
mongodb+srv://mirgorodskiivadim_db_user:FWKtnxXvzqVbhFQC@cluster0.x0jthp4.mongodb.net/analytics?appName=Cluster0
```

**✅ СОХРАНИ эту строку!**

---

## ШАГ 2: GitHub

### 2.1 Создание репозитория

1. Открой [github.com/new](https://github.com/new)
2. Repository name: **ii_analytics**
3. Public или Private - на выбор
4. **НЕ добавляй** README, gitignore
5. **Create repository**

### 2.2 Загрузка файлов

**В терминале:**

```bash
# Перейди в папку с файлами
cd analytics-clean

# Инициализируй git
git init

# Добавь все файлы
git add .

# Закоммить
git commit -m "Initial commit: Analytics with MongoDB"

# Добавь remote (ЗАМЕНИ на свой URL!)
git remote add origin https://github.com/ТВОЙ_USERNAME/ii_analytics.git

# Создай main ветку
git branch -M main

# Push
git push -u origin main
```

**✅ Файлы на GitHub!**

---

## ШАГ 3: Railway

### 3.1 Деплой

1. Открой [railway.app](https://railway.app)
2. **New Project**
3. **Deploy from GitHub repo**
4. Найди и выбери **ii_analytics**
5. Railway начнет деплой (будет падать - это нормально, нужны переменные)

### 3.2 Добавление переменных

1. Открой свой проект в Railway
2. Вкладка **Variables**
3. **+ New Variable**

**Добавь ПЕРВУЮ переменную:**
- **Variable:** `MONGODB_URI`
- **Value:** твоя строка из MongoDB (та что с `/analytics?`)

Пример:
```
mongodb+srv://mirgorodskiivadim_db_user:FWKtnxXvzqVbhFQC@cluster0.x0jthp4.mongodb.net/analytics?appName=Cluster0
```

4. **+ New Variable** еще раз

**Добавь ВТОРУЮ переменную:**
- **Variable:** `ADMIN_KEY`
- **Value:** придумай свой секретный ключ (например `my_secret_key_123`)

5. Railway **автоматически редеплоит**

### 3.3 Получение URL

1. Вкладка **Settings**
2. Секция **Networking**
3. **Generate Domain**
4. Скопируй URL (например `https://ii-analytics-production.up.railway.app`)

**✅ Сохрани этот URL!**

---

## ШАГ 4: Проверка

### 4.1 Проверь логи

В Railway:
1. Вкладка **Deployments**
2. Последний deployment должен быть зеленый
3. Кликни на него → смотри логи

**Должно быть:**
```
🔌 Connecting to MongoDB...
✅ MongoDB connected!
📊 Loaded 0 visits, 0 unique IPs
🚀 Server running on port XXXX
```

### 4.2 Проверь в браузере

Открой:
```
https://твой-url.up.railway.app/
```

**Должно показать:**
```json
{
  "service": "Analytics Service",
  "status": "running",
  "database": "MongoDB",
  "stats": {
    "total_visits": 0,
    "unique_ips": 0
  }
}
```

**✅ Работает!**

---

## ШАГ 5: Добавление на сайт

### На Hypnologue.art (CodePen)

В начало HTML добавь:

```html
<script>
// Трекинг визитов
fetch('https://ТВОЙ_URL.up.railway.app/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site: 'hypnologue',
    page: window.location.pathname,
    referrer: document.referrer
  })
}).catch(err => console.log('Analytics:', err));
</script>
```

**ЗАМЕНИ** `ТВОЙ_URL.up.railway.app` на реальный URL!

### Проверка

1. Зайди на Hypnologue.art
2. Открой DevTools (F12) → Console
3. Не должно быть ошибок
4. Проверь MongoDB Atlas:
   - Database → Browse Collections
   - analytics → visits
   - Должен появиться визит!

**✅ Готово!**

---

## 📊 Как смотреть статистику

### Через curl:

```bash
curl -H "x-admin-key: ТВОЙ_ADMIN_KEY" \
  https://твой-url.up.railway.app/stats
```

### В браузере Console (F12):

```javascript
fetch('https://твой-url.up.railway.app/stats', {
  headers: { 'x-admin-key': 'ТВОЙ_ADMIN_KEY' }
})
.then(r => r.json())
.then(data => {
  console.table(data.summary);
  console.table(data.by_site);
});
```

### В MongoDB Atlas:

1. Database → Browse Collections
2. analytics → visits
3. Смотри все визиты

---

## ❗️ Troubleshooting

### Деплой падает

**Проверь:**
- Добавлены ли обе переменные: `MONGODB_URI` и `ADMIN_KEY`
- Правильная ли строка MongoDB (с `/analytics?`)
- Есть ли все файлы на GitHub

### "MongoDB connection failed"

**Проверь:**
- Network Access в MongoDB Atlas → должно быть `0.0.0.0/0`
- Правильный ли username и password в строке
- Есть ли `/analytics?` в строке подключения

### Визиты не записываются

**Проверь:**
- URL правильный в коде на сайте
- Нет ли ошибок в Console (F12)
- Смотри логи Railway - должно быть "New visit"

---

## 🎉 Готово!

Теперь у тебя:
- ✅ Счетчик визитов работает
- ✅ Данные в MongoDB (не теряются)
- ✅ Можно смотреть статистику
- ✅ Бесплатно!

**Вопросы?** Пиши!
