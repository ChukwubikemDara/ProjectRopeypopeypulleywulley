# Agreed release scope

1. Phone controls: motion stays primary; Kick button for legs/solo, optional Jump/Tuck, complete touch fallback and honest grip/footing/combo feedback. Delivered as be3c3de on dev-david.
2. Map/course loading and host selection, reliable rotation/retry, plus optional shared practice: aim, grip, jump, combo, kick. Short original goofy narration, captions, optional synthesized voice, skip/mute, forgiving retries, no completion gate.
3. Three finished, continuous courses: snowy mountain; forest roots/trunk/branch/canopy; fictionalized Penn State Old Main facade/roof/clock tower. Use the supplied campus/forest images for warm chunky architecture, layered forest light/mist, and the existing soft cartoon style. Same controls and downward gravity; centered 3D movement; smooth vertical/horizontal/diagonal transitions. Each course has one clear main route and one risky shortcut. Use catch ledges; recover automatically only for invalid/stuck/out-of-map states. Race order is mountain → forest → campus; retry stays on the same map; host can override.
4. One sabotage lever: temporary shortcut closure with visible warning and cooldown, preserving the main route and support for anyone already crossing. Then full two-phone course tests and targeted physics/UI/scenery polish.

Deferred: procedural generation, inventories, extra modes, extra motion gestures. Existing grabs/carrying/boosts/kicks/betrayal remain the core party interactions.

Finish and test each significant update, present it for review, and ask for approval before each commit and push. No approval for a previous milestone carries over to a new one.
