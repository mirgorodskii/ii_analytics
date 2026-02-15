# 📊 Analytics Service

Простой сервис для подсчета уникальных посещений сайтов с хранением в MongoDB.

## ⚡️ Быстрый старт

### 1. MongoDB Atlas (5 минут)

1. **Зарегистрируйся:** [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. **Create Free Cluster:**
   - Cloud: AWS
   - Region: US East (Virginia)
   - Tier: M0 Sandbox (FREE)
3. **Database Access:**
   - Add New Database User
   - Autogenerate password → **COPY!**
4. **Network Access:**
   - Add IP Address
   - Allow Access from Anywhere (`0.0.0.0/0`)
5. **Connect:**
   - Drivers → Node.js
   - Copy connection string
   - Замени `<username>` и `<password>`
   - Добавь `/analytics?` после `.mongodb.net/`

**Итоговая строка:**
```
mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/analytics?appName=Cluster0
```

### 2. GitHub

1. Создай новый репозиторий: `ii_analytics`
2. Загрузи эти файлы:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/ii_analytics.git
git branch -M main
git push -u origin main
```

### 3. Railway

1. **New Project** → Deploy from GitHub
2. Выбери `ii_analytics`
3. **Variables** → добавь:
```
MONGODB_URI=твоя_строка_из_mongodb
ADMIN_KEY=твой_секретный_ключ
```
4. **Settings** → Networking → Generate Domain
5. Скопируй URL

### 4. Проверка

Открой в браузере:
```
https://твой-url.up.railway.app/
```

Должно показать:
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

### 5. Добавь на сайт

```html
<script>
fetch('https://твой-url.up.railway.app/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    site: 'hypnologue',
    page: window.location.pathname,
    referrer: document.referrer
  })
}).catch(console.error);
</script>
```

## 📊 API

### POST /track
Записать визит (публичный)

### GET /stats
Статистика (требует `x-admin-key` в headers)

### GET /admin/export?format=csv
Экспорт данных (требует `x-admin-key`)

## 🔍 Смотреть статистику

```bash
curl -H "x-admin-key: ТВОЙ_КЛЮЧ" \
  https://твой-url.up.railway.app/stats
```

Или в MongoDB Atlas:
- Database → Browse Collections → analytics → visits

## ✅ Готово!

Теперь у тебя работает счетчик посещений с уникальными IP!
