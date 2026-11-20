"use strict";

var earthApp = {ready: false, initialized: false, colorReady: false, status: "initializing"};
var canvas, gl, program, uniforms = {}, locations = {};
var earthMesh, supermanMesh, axisMesh, orbitMesh, markerMesh;
var colorTexture, normalTexture, elevationData = null;
var apiBase = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/etopo180.json?";
var jsonpSequence = 0;
var state = {
    spin: -105, orbit: 65, lightAngle: -35, paused: false, orbitEnabled: true,
    lightMoving: false, zoom: 100, heightScale: 35, bumpStrength: 1.3,
    yaw: 0, pitch: 9, apiBusy: false, marker: null
};
earthApp.state = state;

function element(id) { return document.getElementById(id); }

function uploadMesh(mesh, previous) {
    var arrays = [mesh.positions, mesh.normals, mesh.tangents, mesh.texCoords, mesh.colors];
    var names = ["vPosition", "vNormal", "vTangent", "vTexCoord", "vColor"];
    var sizes = [4, 3, 3, 2, 4];
    var result = previous || {buffers: []};
    for (var i = 0; i < names.length; i++) {
        if (!result.buffers[i]) result.buffers[i] = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, result.buffers[i]);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(arrays[i]), gl.STATIC_DRAW);
    }
    result.count = mesh.positions.length;
    result.names = names;
    result.sizes = sizes;
    return result;
}

function solidMesh(positions, normals, colors) {
    var mesh = {positions: [], normals: normals, colors: colors, tangents: [], texCoords: []};
    for (var i = 0; i < positions.length; i++) {
        var p = positions[i], n = normals[i];
        mesh.positions.push(vec4(p[0], p[1], p[2], 1));
        mesh.tangents.push(Math.abs(n[1]) < 0.9 ? normalize(cross(vec3(0, 1, 0), n)) : vec3(1, 0, 0));
        mesh.texCoords.push(vec2(0, 0));
    }
    return mesh;
}

function makeLineMesh(kind) {
    var positions = [], normals = [], colors = [];
    if (kind === "axis") {
        positions = [[0, -2.8, 0], [0, 2.8, 0]];
        colors = [vec4(1, 0.80, 0.18, 1), vec4(1, 0.80, 0.18, 1)];
        normals = [[0, 1, 0], [0, 1, 0]];
    } else {
        for (var i = 0; i <= 180; i++) {
            var angle = i * 2 * Math.PI / 180;
            positions.push([3.05 * Math.sin(angle), 0, 3.05 * Math.cos(angle)]);
            colors.push(vec4(0.35, 0.48, 0.64, 1));
            normals.push([0, 1, 0]);
        }
    }
    return solidMesh(positions, normals, colors);
}

function makeMarkerMesh() {
    var points = [[0, 0.10, 0], [-0.07, 0, 0], [0, 0, 0.07], [0.07, 0, 0], [0, 0, -0.07], [0, -0.10, 0]];
    var triangles = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]];
    var positions = [], normals = [], colors = [];
    for (var i = 0; i < triangles.length; i++) {
        var a = points[triangles[i][0]], b = points[triangles[i][1]], c = points[triangles[i][2]];
        var n = normalize(cross(subtract(b, a), subtract(c, a)));
        for (var j = 0; j < 3; j++) {
            positions.push(points[triangles[i][j]]); normals.push(n); colors.push(vec4(1, 0.36, 0.04, 1));
        }
    }
    return solidMesh(positions, normals, colors);
}

function clearTerrain() { // 이전 지형과 조회 위치 제거
    earthApp.ready = false;
    state.marker = null;
    elevationData = null;
    earthApp.elevationData = null;
    earthApp.normalMap = null;
    if (earthMesh) {
        for (var i = 0; i < earthMesh.buffers.length; i++) gl.deleteBuffer(earthMesh.buffers[i]);
    }
    earthMesh = null;
    earthApp.earthMesh = null;
    if (normalTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, normalTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 255, 0]));
    }
    if (gl) gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function updateTerrain() {
    if (!elevationData) return;
    var mesh = EarthMath.buildEarthMesh(elevationData, 192, 96, state.heightScale);
    earthMesh = uploadMesh(mesh, earthMesh); // 높이 변경 시 기존 버퍼를 다시 사용
    earthApp.earthMesh = earthMesh;
}

function updateNormalTexture() {
    var map = EarthMath.buildNormalMap(elevationData, 1024, 512, 35);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, normalTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, map.width, map.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, map.pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    earthApp.normalMap = map;
}

function draw(mesh, model, view, material, primitive) {
    for (var i = 0; i < mesh.buffers.length; i++) {
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffers[i]);
        gl.vertexAttribPointer(locations[mesh.names[i]], mesh.sizes[i], gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(locations[mesh.names[i]]);
    }
    var mv = mult(view, model);
    gl.uniformMatrix4fv(uniforms.modelViewMatrix, false, flatten(mv));
    gl.uniformMatrix3fv(uniforms.normalMatrix, false, flatten(normalMatrix(mv, true)));
    gl.uniform1i(uniforms.material, material);
    gl.drawArrays(primitive, 0, mesh.count);
}

function syncControls() {
    state.zoom = Number(element("zoom").value);
    state.bumpStrength = element("bump-enabled").checked ? Number(element("bump-strength").value) : 0;
    state.orbitEnabled = element("superman-enabled").checked;
    state.lightMoving = element("light-moving").checked;
    var height = Number(element("height-scale").value);
    if (height !== state.heightScale) {
        state.heightScale = height;
        if (earthApp.ready) updateTerrain();
    }
    if (!state.lightMoving) state.lightAngle = Number(element("light-angle").value);
    element("zoom-value").innerHTML = state.zoom;
    element("height-value").innerHTML = state.heightScale;
    element("bump-value").innerHTML = Number(element("bump-strength").value).toFixed(1);
    element("spin-value").innerHTML = element("spin-speed").value;
    element("orbit-value").innerHTML = element("orbit-speed").value;
    element("light-value").innerHTML = Math.round(state.lightAngle);
}

function render(time) {
    if (typeof time !== "number") time = Date.now();
    var dt = earthApp.lastTime === undefined ? 0 : Math.max(0, Math.min((time - earthApp.lastTime) / 1000, 0.05));
    earthApp.lastTime = time;
    syncControls();
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    earthApp.frames = (earthApp.frames || 0) + 1;
    if (!earthApp.ready) {
        requestAnimFrame(render);
        return;
    }
    if (!state.paused) state.spin = (state.spin + Number(element("spin-speed").value) * dt) % 360;
    if (state.orbitEnabled) state.orbit = (state.orbit + Number(element("orbit-speed").value) * dt) % 360;
    if (state.lightMoving) {
        state.lightAngle = (state.lightAngle + 180 + 12 * dt) % 360 - 180;
        element("light-angle").value = Math.round(state.lightAngle);
    }
    var y = state.yaw * Math.PI / 180, p = state.pitch * Math.PI / 180, distance = 8.8 * 100 / state.zoom;
    var eye = vec3(distance * Math.cos(p) * Math.sin(y), distance * Math.sin(p), distance * Math.cos(p) * Math.cos(y));
    var view = lookAt(eye, vec3(0, 0, 0), vec3(0, 1, 0));
    var projection = perspective(45, canvas.width / canvas.height, 0.1, 40);
    var lightAngle = state.lightAngle * Math.PI / 180;
    var worldLight = vec4(Math.sin(lightAngle), 0.35, Math.cos(lightAngle), 0);
    var light = mult(view, worldLight); // 광원에는 지구의 자전 행렬을 적용하지 않음
    gl.uniformMatrix4fv(uniforms.projectionMatrix, false, flatten(projection));
    gl.uniform3fv(uniforms.lightDirection, flatten(vec3(light[0], light[1], light[2])));
    gl.uniform1f(uniforms.bumpStrength, state.bumpStrength);
    gl.uniform1f(uniforms.heightColors, element("height-colors").checked ? 1 : 0);
    var model = EarthMath.earthModel(state.spin, 23.44);
    draw(earthMesh, model, view, 0, gl.TRIANGLES);
    if (element("show-axis").checked) draw(axisMesh, rotateZ(-23.44), view, 2, gl.LINES);
    if (element("show-orbit").checked) draw(orbitMesh, rotateZ(35), view, 2, gl.LINE_STRIP);
    var orbit = EarthMath.orbitModel(state.orbit, 35, 3.05); // Codex 도움 시작: 슈퍼맨 배치
    draw(supermanMesh, mult(orbit, scalem(1.25, 1.25, 1.25)), view, 1, gl.TRIANGLES); // Codex 도움 끝: 슈퍼맨 그리기
    if (state.marker) {
        var height = Math.max(0, EarthMath.sampleElevation(elevationData, state.marker.lat, state.marker.lon));
        var point = EarthMath.point(state.marker.lat, state.marker.lon, 2.05 * (1 + height * state.heightScale / 6371000) + 0.12);
        draw(markerMesh, mult(model, translate(point[0], point[1], point[2])), view, 2, gl.TRIANGLES);
    }
    requestAnimFrame(render);
}

function setBusy(busy) {
    state.apiBusy = busy;
    element("query-elevation").disabled = busy || !earthApp.ready;
    element("reload-elevation").disabled = busy || !earthApp.initialized;
}

function requestJSONP(url, timeout) {
    return new Promise(function (resolve, reject) {
        var script = document.createElement("script"), timer, cleanupTimer, finished = false;
        var callback = "earthElevation_" + Date.now() + "_" + (++jsonpSequence);
        while (callback in window) callback += "_";
        function cleanup() {
            clearTimeout(timer);
            clearTimeout(cleanupTimer);
            script.onload = null; script.onerror = null;
            if (script.parentNode) script.parentNode.removeChild(script);
            delete window[callback]; // 사용한 콜백과 script 제거
        }
        function finish(error, data) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(data);
        }
        window[callback] = function (data) {
            if (finished) return; // 늦게 오거나 중복된 응답은 무시
            if (!data || !data.table || !Array.isArray(data.table.columnNames) || !Array.isArray(data.table.rows)) {
                finish(new Error("고도 API 응답 형식이 다릅니다."));
                return;
            }
            finish(null, data);
        };
        script.async = true;
        script.onload = function () { finish(new Error("고도 API 콜백을 받지 못했습니다.")); cleanup(); };
        script.onerror = function () { finish(new Error("고도 API에 연결하지 못했습니다.")); cleanup(); };
        timer = setTimeout(function () {
            finish(new Error("고도 API 응답 시간이 초과되었습니다."));
            if (script.parentNode) script.parentNode.removeChild(script);
            cleanupTimer = setTimeout(cleanup, 60000); // 늦은 응답을 잠시 받아 버린 뒤 정리
        }, timeout);
        script.src = url + "&.jsonp=" + callback; // NOAA가 제공하는 JSONP 사용
        try { document.head.appendChild(script); }
        catch (error) { finish(new Error("고도 API 요청을 시작하지 못했습니다.")); cleanup(); }
    });
}

function parseGlobalData(response) {
    var table = response && response.table;
    if (!table || !Array.isArray(table.rows) || !Array.isArray(table.columnNames) || table.columnNames.join(",") !== "latitude,longitude,altitude" || table.rows.length !== 721 * 361) throw new Error("API 고도 데이터의 형식이 다릅니다.");
    var values = new Array(721 * 361);
    for (var y = 0; y < 361; y++) {
        for (var x = 0; x < 721; x++) {
            var row = table.rows[y * 721 + x];
            if (!Array.isArray(row) || row.length !== 3 || row.some(function (value) { return typeof value !== "number" || !isFinite(value); }) || row[2] === 32767 || Math.abs(row[0] - (-90 + y * 0.5)) > 0.0001 || Math.abs(row[1] - (-180 + x * 0.5)) > 0.0001) throw new Error("누락되거나 잘못된 API 고도 데이터가 있습니다.");
            values[(360 - y) * 721 + x] = row[2]; // API의 남→북 행을 북→남으로 변환
        }
    }
    return {width: 721, height: 361, latMin: -90, latMax: 90, lonMin: -180, lonMax: 180, rowOrder: "north-to-south", elevations: values};
}

function loadColorTexture() { // 일반 JPG 색상 지도 불러오기
    if (earthApp.colorReady) return Promise.resolve();
    return new Promise(function (resolve, reject) {
        var image = new Image();
        var timer = setTimeout(function () {
            image.onload = null; image.onerror = null;
            reject(new Error("지구 색상 이미지 응답 시간이 초과되었습니다."));
        }, 10000);
        image.onload = function () {
            clearTimeout(timer);
            try {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, colorTexture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                earthApp.colorReady = true;
                resolve();
            } catch (error) {
                reject(new Error("지구 색상 이미지를 사용할 수 없습니다. HTTP 서버로 열었는지 확인하세요."));
            }
        };
        image.onerror = function () {
            clearTimeout(timer);
            reject(new Error("지구 색상 이미지를 불러오지 못했습니다. assets/earth-color.jpg를 확인하세요."));
        };
        image.src = "assets/earth-color.jpg";
    });
}

function reloadElevation() { // 실행할 때 API로 지구 구성
    if (state.apiBusy || !earthApp.initialized) return Promise.resolve(false);
    clearTerrain();
    earthApp.status = "loading";
    earthApp.error = null;
    setBusy(true);
    element("render-status").textContent = "API에서 전 지구 고도를 받아 지구를 만들고 있습니다.";
    element("api-status").textContent = "전 지구 고도 260,281개를 API에서 불러오고 있습니다.";
    element("data-status").textContent = "고도 API 요청이 성공한 뒤 지형과 Bump Mapping을 만듭니다.";
    var url = apiBase + "altitude%5B(-90):30:(90)%5D%5B(-180):30:(180)%5D";
    return loadColorTexture().then(function () {
        return requestJSONP(url, 45000);
    }).then(function (response) {
        var fresh = parseGlobalData(response);
        elevationData = fresh;
        earthApp.elevationData = fresh;
        state.heightScale = Number(element("height-scale").value);
        updateTerrain();
        updateNormalTexture();
        earthApp.ready = true;
        earthApp.status = "ready";
        earthApp.lastTime = undefined;
        element("render-status").textContent = "지구: 36,480개 삼각형 / 지형 정점 변위 + 고도 차분 Bump Mapping / 자전축 23.44°";
        element("data-status").textContent = "모형: 이번 실행에서 API로 받은 고도 데이터, 0.5° 간격 721 × 361. 육지는 고도로 표현하고 바다는 해수면으로 표시합니다.";
        element("api-status").textContent = "전 지구 고도 불러오기 완료. 좌표를 입력해 해당 위치의 고도를 조회할 수 있습니다.";
        setBusy(false);
        return true;
    }).catch(function (error) {
        clearTerrain();
        earthApp.status = "error";
        earthApp.error = error.message;
        element("render-status").textContent = "지구를 불러오지 못했습니다. 전 지구 고도 다시 불러오기 버튼으로 재시도하세요.";
        element("api-status").textContent = "지구 준비 실패: " + earthApp.error;
        element("data-status").textContent = "API 고도 데이터가 없어 지형을 표시하지 않습니다. 인터넷 연결과 API 상태를 확인한 뒤 다시 시도하세요.";
        setBusy(false);
        return false;
    });
}

function queryElevation() { // 한 위치의 고도 조회
    if (state.apiBusy) return Promise.resolve(false);
    state.marker = null;
    if (!earthApp.ready || !elevationData) {
        element("api-status").textContent = "먼저 전 지구 고도를 API에서 불러와 지구를 준비하세요.";
        return Promise.resolve(false);
    }
    var latText = element("latitude").value, lonText = element("longitude").value;
    var lat = Number(latText), lon = Number(lonText);
    if (latText.trim() === "" || lonText.trim() === "" || !isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        element("api-status").innerHTML = "위도는 -90~90, 경도는 -180~180 범위의 숫자를 입력하세요.";
        return Promise.resolve(false);
    }
    setBusy(true);
    element("api-status").innerHTML = "입력한 좌표의 고도를 조회하고 있습니다.";
    return requestJSONP(apiBase + "altitude%5B(" + lat + ")%5D%5B(" + lon + ")%5D", 20000).then(function (response) {
        var table = response && response.table;
        if (!table || !Array.isArray(table.rows) || table.rows.length !== 1 || !Array.isArray(table.columnNames) || table.columnNames.join(",") !== "latitude,longitude,altitude") throw new Error("잘못된 응답");
        var row = table.rows[0];
        if (!Array.isArray(row) || row.length !== 3 || row.some(function (v) { return typeof v !== "number" || !isFinite(v); }) || row[2] === 32767 || row[0] < -90 || row[0] > 90 || row[1] < -180 || row[1] > 180) throw new Error("고도 누락");
        state.marker = {lat: row[0], lon: row[1], elevation: row[2]};
        state.paused = true;
        state.spin = -row[1]; state.yaw = 0; state.pitch = Math.max(-65, Math.min(65, row[0]));
        element("spin-button").innerHTML = "자전 시작";
        element("api-status").textContent = "입력한 위치: " + lat.toFixed(4) + "°, " + lon.toFixed(4) + "° / API가 찾은 위치: " + row[0].toFixed(5) + "°, " + row[1].toFixed(5) + "° / 고도: " + row[2] + " m. 주황색으로 조회 위치를 표시했습니다. API의 원래 고도 데이터는 약 0.0167° 간격(위도 방향 약 1.85 km)이므로 지구 표현에 사용하는 0.5° 간격 데이터와 값이 다를 수 있습니다.";
        setBusy(false);
        return true;
    }).catch(function () {
        state.marker = null;
        element("api-status").textContent = "해당 위치의 고도 조회에 실패했습니다. 조회 위치를 표시하지 않습니다. 인터넷 연결 또는 API 상태를 확인한 뒤 다시 조회하세요.";
        setBusy(false);
        return false;
    });
}

function resizeCanvas() {
    canvas.width = Math.max(240, Math.min(960, window.innerWidth - 20));
    canvas.height = Math.round(canvas.width * 0.625);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function initInput() {
    element("spin-button").onclick = function () {
        state.paused = !state.paused;
        this.innerHTML = state.paused ? "자전 시작" : "자전 일시정지";
    };
    element("reset-view").onclick = function () { state.yaw = 0; state.pitch = 9; element("zoom").value = 100; };
    element("query-elevation").onclick = queryElevation;
    element("reload-elevation").onclick = reloadElevation;
    var places = [["place-seoul", 37.5665, 126.978], ["place-austin", 30.2672, -97.7431]];
    places.forEach(function (place) {
        element(place[0]).onclick = function () { element("latitude").value = place[1]; element("longitude").value = place[2]; };
    });
    var dragging = false, lastX = 0, lastY = 0;
    canvas.onmousedown = function (event) { dragging = true; lastX = event.clientX; lastY = event.clientY; event.preventDefault(); };
    window.onmousemove = function (event) {
        if (!dragging) return;
        state.yaw -= (event.clientX - lastX) * 0.4;
        state.pitch = Math.max(-80, Math.min(80, state.pitch + (event.clientY - lastY) * 0.4));
        lastX = event.clientX; lastY = event.clientY;
    };
    window.onmouseup = function () { dragging = false; };
    window.onblur = function () { dragging = false; };
    window.onresize = resizeCanvas;
}

window.onload = function init() {
    canvas = element("gl-canvas");
    if (location.protocol !== "http:" && location.protocol !== "https:") {
        earthApp.status = "error";
        element("render-status").textContent = "HTTP 서버로 실행해야 합니다. 실행 안내에 따라 서버를 켠 뒤 주소로 접속하세요.";
        element("api-status").textContent = "파일을 직접 열면 지구를 준비하지 않습니다. HTTP 서버 주소로 다시 열어주세요.";
        element("data-status").textContent = "지구를 표시하려면 색상 이미지와 실제 고도 API 연결이 필요합니다.";
        return;
    }
    gl = WebGLUtils.setupWebGL(canvas);
    if (!gl) {
        earthApp.status = "error";
        element("render-status").textContent = "WebGL을 사용할 수 없습니다.";
        element("api-status").textContent = "WebGL을 지원하는 브라우저에서 다시 실행하세요.";
        return;
    }
    program = initShaders(gl, "vertex-shader", "fragment-shader");
    if (program === -1) {
        earthApp.status = "error";
        element("render-status").textContent = "셰이더를 준비하지 못했습니다.";
        element("api-status").textContent = "셰이더 코드와 브라우저의 WebGL 지원을 확인하세요.";
        return;
    }
    gl.useProgram(program);
    earthApp.gl = gl; earthApp.program = program;
    ["vPosition", "vNormal", "vTangent", "vTexCoord", "vColor"].forEach(function (name) { locations[name] = gl.getAttribLocation(program, name); });
    ["modelViewMatrix", "projectionMatrix", "normalMatrix", "colorMap", "normalMap", "lightDirection", "bumpStrength", "heightColors", "material"].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, name); });
    gl.clearColor(0.012, 0.020, 0.045, 1);
    gl.enable(gl.DEPTH_TEST);
    colorTexture = gl.createTexture(); normalTexture = gl.createTexture();
    gl.uniform1i(uniforms.colorMap, 0); gl.uniform1i(uniforms.normalMap, 1);
    var superman = makeSupermanMesh(); // Codex 도움 시작: 슈퍼맨 데이터 연결
    supermanMesh = uploadMesh(solidMesh(superman.positions, superman.normals, superman.colors)); // Codex 도움 끝: GPU 버퍼 연결
    axisMesh = uploadMesh(makeLineMesh("axis"));
    orbitMesh = uploadMesh(makeLineMesh("orbit"));
    markerMesh = uploadMesh(makeMarkerMesh());
    initInput(); resizeCanvas();
    earthApp.initialized = true;
    requestAnimFrame(render);
    reloadElevation();
};
