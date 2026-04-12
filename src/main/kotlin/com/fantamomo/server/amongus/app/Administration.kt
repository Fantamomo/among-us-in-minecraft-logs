package com.fantamomo.server.amongus.app

import io.ktor.server.application.*
import io.ktor.server.plugins.ratelimit.*
import kotlin.time.Duration.Companion.seconds

fun Application.configureAdministration() {
    install(RateLimit) {
        global {
            rateLimiter(limit = 100, refillPeriod = 10.seconds)
        }
        register {
            rateLimiter(limit = 10, refillPeriod = 60.seconds)
        }
    }
//    routing {
//        route("/upload") {
//            install(RateLimiting) {
//                rateLimiter {
//                    type = TokenBucket::class
//                    capacity = 10
//                    rate = 1.minutes
//                }
//            }
//        }
//    }
}
