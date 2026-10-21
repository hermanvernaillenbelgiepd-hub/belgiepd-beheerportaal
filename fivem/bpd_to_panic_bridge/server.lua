-- SERVER-SIDE ONLY. Requires sonoranradio. No client-triggered network event.
local apiUrl = GetConvar('bpd_panic_url', '')
local token = GetConvar('bpd_panic_token', '')

local function configured()
    return type(apiUrl) == 'string' and apiUrl:sub(1, 8) == 'https://' and
        type(token) == 'string' and #token >= 32
end

local function posFromPlayer(player)
    if type(player) ~= 'table' then return nil end
    local p = player.position
    if type(p) == 'table' and type(p.x) == 'number' and
       type(p.y) == 'number' and type(p.z) == 'number' then
        return { x = p.x, y = p.y, z = p.z }
    end
    local id = tonumber(player.serverId)
    if not id or id < 1 then return nil end
    local ped = GetPlayerPed(id)
    if not ped or ped <= 0 then return nil end
    local coords = GetEntityCoords(ped)
    if not coords then return nil end
    return { x = coords.x, y = coords.y, z = coords.z }
end

local function forward(kind, data)
    if not configured() then
        print('[BPD Panic] Koppeling nog niet ingesteld. Controleer bpd_panic_url en bpd_panic_token.')
        return
    end
    if type(data) ~= 'table' or type(data.player) ~= 'table' then
        print('[BPD Panic] Ongeldig Sonoran Developer-event, overgeslagen.')
        return
    end
    local player = data.player
    local id = tonumber(player.serverId)
    if not id or id < 1 or id > 999999 then return end
    local name = type(player.name) == 'string' and player.name or GetPlayerName(id)
    if not name or #name < 1 then name = 'FiveM #' .. tostring(id) end
    local payload = {
        event = kind,
        serverId = id,
        name = name,
        occurredAt = os.time() * 1000,
        position = posFromPlayer(player),
        heading = type(player.heading) == 'number' and player.heading or nil
    }
    PerformHttpRequest(apiUrl, function(statusCode)
        if statusCode ~= 202 then
            print('[BPD Panic] Doorgeven mislukt (HTTP ' .. tostring(statusCode) .. ').')
        end
    end, 'POST', json.encode(payload), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. token
    })
end

AddEventHandler('SonoranRadio::Developer:Panic:Activated', function(data)
    forward('activated', data)
end)
AddEventHandler('SonoranRadio::Developer:Panic:Cleared', function(data)
    forward('cleared', data)
end)

CreateThread(function()
    Wait(1500)
    if configured() then
        print('[BPD Panic] Sonoran noodknopkoppeling geladen.')
    else
        print('[BPD Panic] Niet actief: veilige URL en apart token ontbreken.')
    end
end)
