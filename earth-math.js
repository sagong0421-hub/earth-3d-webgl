"use strict";

var EarthMath = {};

EarthMath.point = function (lat, lon, radius) {
    var p = lat * Math.PI / 180, l = lon * Math.PI / 180;
    var c = Math.abs(lat) === 90 ? 0 : Math.cos(p);
    return [radius * c * Math.sin(l), radius * Math.sin(p), radius * c * Math.cos(l)]; // 위도와 경도를 구 좌표로 변환
};

EarthMath.sampleElevation = function (data, lat, lon) {
    var width = data.width, height = data.height;
    var longitude = ((lon + 180) % 360 + 360) % 360;
    var x = longitude / 360 * (width - 1);
    var y = (90 - Math.max(-90, Math.min(90, lat))) / 180 * (height - 1);
    if (lat >= 90 || lat <= -90) x = 0; // 극점은 하나의 좌표로 합침
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var x1 = (x0 + 1) % (width - 1), y1 = Math.min(y0 + 1, height - 1);
    var a = x - x0, b = y - y0;
    var top = data.elevations[y0 * width + x0] * (1 - a) + data.elevations[y0 * width + x1] * a;
    var bottom = data.elevations[y1 * width + x0] * (1 - a) + data.elevations[y1 * width + x1] * a;
    return top * (1 - b) + bottom * b; // 인접한 네 고도를 보간
};

EarthMath.buildNormalMap = function (data, width, height, scale) {
    var pixels = new Uint8Array(width * height * 4);
    var dl = 360 / width, dp = 180 / height;
    var northDistance = 6371000 * dp * Math.PI / 180;
    function land(lat, lon) { return Math.max(0, EarthMath.sampleElevation(data, lat, lon)); }
    for (var y = 0; y < height; y++) {
        var lat = -90 + 180 * (y + 0.5) / height; // 텍스처의 첫 행은 남쪽
        var eastDistance = 6371000 * dl * Math.PI / 180 * Math.max(0.02, Math.cos(lat * Math.PI / 180));
        for (var x = 0; x < width; x++) {
            var lon = -180 + 360 * (x + 0.5) / width;
            var east = (land(lat, lon + dl) - land(lat, lon - dl)) / (2 * eastDistance);
            var north = (land(Math.min(90, lat + dp), lon) - land(Math.max(-90, lat - dp), lon)) / (2 * northDistance);
            var n = normalize(vec3(-east * scale, -north * scale, 1)); // 높이 차분으로 접선 공간 법선 계산
            var index = 4 * (y * width + x);
            pixels[index] = Math.round((n[0] * 0.5 + 0.5) * 255);
            pixels[index + 1] = Math.round((n[1] * 0.5 + 0.5) * 255);
            pixels[index + 2] = Math.round((n[2] * 0.5 + 0.5) * 255);
            pixels[index + 3] = Math.round(Math.min(1, land(lat, lon) / 10000) * 255); // 고도 색상에 사용할 값
        }
    }
    return {pixels: pixels, width: width, height: height};
};

EarthMath.earthModel = function (spin, tilt) {
    return mult(rotateZ(-tilt), rotateY(spin)); // 기울어진 자전축을 유지
};

EarthMath.orbitModel = function (angle, tilt, radius) { // Codex 도움 시작: 슈퍼맨 공전 행렬
    return mult(rotateZ(tilt), mult(rotateY(angle), translate(0, 0, radius))); // 지구 중심의 기울어진 공전 궤도
}; // Codex 도움 끝: 슈퍼맨 공전 행렬

EarthMath.buildEarthMesh = function (data, longitudeSteps, latitudeSteps, exaggeration) {
    var positions = [], normals = [], tangents = [], texCoords = [], colors = [];
    function vertex(lat, lon) {
        var height = Math.max(0, EarthMath.sampleElevation(data, lat, lon)); // 바다는 해수면으로 표시
        var n = EarthMath.point(lat, lon, 1);
        var p = EarthMath.point(lat, lon, 2.05 * (1 + height * exaggeration / 6371000));
        positions.push(vec4(p[0], p[1], p[2], 1));
        normals.push(n);
        var l = lon * Math.PI / 180;
        tangents.push(vec3(Math.cos(l), 0, -Math.sin(l)));
        texCoords.push(vec2((lon + 180) / 360, (lat + 90) / 180));
        colors.push(vec4(1, 1, 1, 1));
    }
    for (var y = 0; y < latitudeSteps; y++) {
        var south = -90 + y * 180 / latitudeSteps;
        var north = -90 + (y + 1) * 180 / latitudeSteps;
        for (var x = 0; x < longitudeSteps; x++) {
            var west = -180 + x * 360 / longitudeSteps;
            var east = -180 + (x + 1) * 360 / longitudeSteps;
            if (y > 0) { vertex(south, west); vertex(south, east); vertex(north, east); }
            if (y < latitudeSteps - 1) { vertex(south, west); vertex(north, east); vertex(north, west); } // 사각형을 삼각형 두 개로 구성
        }
    }
    return {positions: positions, normals: normals, tangents: tangents, texCoords: texCoords, colors: colors};
};
