package com.fantamomo.server.amongus.app

import com.fantamomo.server.amongus.ServerConfig
import io.ktor.server.application.*
import io.ktor.server.auth.*

fun Application.configureSecurity() {
    install(Authentication) {
        bearer {
            realm = "Access to the '/admin' path"
            authenticate { tokenCredential ->
                if (tokenCredential.token == ServerConfig.GITHUB_ACTION_KEY) {
                    UserIdPrincipal("github")
                } else {
                    null
                }
            }
        }
    }
}
