import express from "express"
import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import rateLimit from "express-rate-limit"
import {collectStatistics} from "./stats.js";

const app = express()

const LOG_DIR = path.resolve("../logs")
const LOG_TTL = 60 * 60 * 1000

const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
})

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

app.post("/upload", uploadLimiter, async (req, res) => {

    try {

        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({error: "invalid body"})
        }

        const id = crypto.randomBytes(8).toString("hex")
        const filePath = path.join(LOG_DIR, `${id}.json`)

        const rawBody = JSON.stringify(req.body)

        await fs.writeFile(filePath, rawBody)

        setTimeout(async () => {
            try {
                await fs.unlink(filePath)
            } catch {
            }
        }, LOG_TTL)

        const stats = "statistics" in req.query &&
            (req.query.statistics === "true" ||
                req.query.statistics === "1")

        if (stats) {
            try {
                collectStatistics(id, req.body, Buffer.byteLength(rawBody))
            } catch (err) {
                console.error("state collection failed", err)
            }
        }

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
    res.sendFile(path.resolve("../frontend/index.html"))
})

app.listen(process.env.PORT || 29243, () => {
    console.log("server running")
})