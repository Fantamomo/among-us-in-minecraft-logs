import express from "express"
import crypto from "crypto"
import fs from "fs/promises"
import path from "path"

const app = express()

const LOG_DIR = path.resolve("logs")
const LOG_TTL = 60 * 60 * 1000

app.use(express.json({limit: "1mb"}))

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("X-XSS-Protection", "1; mode=block")
    next()
})

await fs.mkdir(LOG_DIR, {recursive: true})

app.get("/", (req, res) => {
    res.redirect("https://among-us-in-minecraft.docs.fantamomo.com")
})

app.post("/upload", async (req, res) => {

    try {

        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({error: "invalid body"})
        }

        const id = crypto.randomBytes(8).toString("hex")
        const filePath = path.join(LOG_DIR, `${id}.json`)

        await fs.writeFile(filePath, JSON.stringify(req.body))

        setTimeout(async () => {
            try {
                await fs.unlink(filePath)
            } catch {
            }
        }, LOG_TTL)

        res.json({
            url: `/log/${id}`
        })

    } catch (err) {
        console.error(err)
        res.status(500).json({error: "internal error"})
    }
})

app.get("/raw/:id", async (req, res) => {

    try {

        const {id} = req.params

        if (!/^[a-f0-9]{16}$/.test(id)) {
            return res.status(400).json({error: "invalid id"})
        }

        const filePath = path.join(LOG_DIR, `${id}.json`)

        const data = await fs.readFile(filePath, "utf8")

        res.type("application/json").send(data)

    } catch {
        res.status(404).json({error: "not found"})
    }
})

app.get("/log/:id", async (req, res) => {
    const { id } = req.params

    if (!/^[a-f0-9]{16}$/.test(id)) {
        return res.status(400).json({ error: "invalid id" })
    }

    const filePath = path.join(LOG_DIR, `${id}.json`)
    try {
        await fs.access(filePath)
    } catch {
        return res.status(404).json({ error: "not found" })
    }

    res.sendFile(path.resolve("frontend/index.html"))
})

app.listen(process.env.PORT || 29243, () => {
    console.log("server running")
})