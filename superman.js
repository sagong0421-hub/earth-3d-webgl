"use strict";

window.makeSupermanMesh = function () { // Codex 도움 시작: 슈퍼맨 모형 생성
    var positions = [], normals = [], colors = [];
    var blue = [0.025, 0.16, 0.86, 1.0];
    var red = [0.90, 0.025, 0.045, 1.0];
    var yellow = [1.0, 0.81, 0.05, 1.0];
    var skin = [1.0, 0.69, 0.43, 1.0];
    var black = [0.018, 0.025, 0.035, 1.0];

    function difference(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }

    function unit(a) {
        var length = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
        return [a[0] / length, a[1] / length, a[2] / length];
    }

    function product(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    function triangle(a, b, c, color) {
        var normal = unit(product(difference(b, a), difference(c, a)));
        var vertices = [a, b, c];
        for (var i = 0; i < 3; i++) {
            positions.push([vertices[i][0] * 0.76, vertices[i][1] * 0.76, vertices[i][2] * 0.76]);
            normals.push(normal);
            colors.push(color);
        }
    }

    function quad(a, b, c, d, color) {
        triangle(a, b, c, color);
        triangle(a, c, d, color);
    }

    function block(a, b, width, depth, color) {
        var axis = unit(difference(b, a));
        var side = unit(product(axis, [0, 1, 0]));
        var up = unit(product(side, axis));
        var vertices = [];
        for (var i = 0; i < 2; i++) {
            var center = i === 0 ? a : b;
            for (var j = 0; j < 4; j++) {
                var s = j === 0 || j === 3 ? -1 : 1;
                var t = j < 2 ? -1 : 1;
                vertices.push([
                    center[0] + side[0] * width * s / 2 + up[0] * depth * t / 2,
                    center[1] + side[1] * width * s / 2 + up[1] * depth * t / 2,
                    center[2] + side[2] * width * s / 2 + up[2] * depth * t / 2
                ]);
            }
        }
        var faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
        for (var k = 0; k < faces.length; k++) {
            var f = faces[k];
            quad(vertices[f[0]], vertices[f[3]], vertices[f[2]], vertices[f[1]], color);
        }
    }

    function sphere(center, radius, color, topOnly) {
        var rows = topOnly ? 3 : 6;
        var columns = 10;
        var maxAngle = topOnly ? Math.PI / 2 : Math.PI;
        function point(latitude, longitude) {
            return [
                center[0] + radius[0] * Math.sin(latitude) * Math.cos(longitude),
                center[1] + radius[1] * Math.cos(latitude),
                center[2] + radius[2] * Math.sin(latitude) * Math.sin(longitude)
            ];
        }
        for (var row = 0; row < rows; row++) {
            for (var col = 0; col < columns; col++) {
                var t0 = maxAngle * row / rows, t1 = maxAngle * (row + 1) / rows;
                var p0 = 2 * Math.PI * col / columns, p1 = 2 * Math.PI * (col + 1) / columns;
                var a = point(t0, p0), b = point(t1, p0), c = point(t1, p1), d = point(t0, p1);
                if (row > 0) triangle(a, d, c, color);
                if (topOnly || row < rows - 1) triangle(a, c, b, color);
            }
        }
    }

    block([-0.20, 0, 0], [0.20, 0, 0], 0.31, 0.19, blue); // 몸통
    block([-0.22, 0, 0], [-0.16, 0, 0], 0.32, 0.20, red); // 허리 부분
    quad([-0.22, -0.103, -0.16], [-0.17, -0.103, -0.16], [-0.17, -0.103, 0.16], [-0.22, -0.103, 0.16], yellow); // 벨트

    for (var side = -1; side <= 1; side += 2) {
        var z = side * 0.095;
        block([-0.20, 0, z], [-0.40, 0.01, z * 1.10], 0.115, 0.13, blue); // 다리
        block([-0.40, 0.01, z * 1.10], [-0.58, -0.015, z * 1.14], 0.125, 0.14, red); // 부츠
        block([0.13, 0.005, side * 0.19], [0.40, 0.018, side * 0.20], 0.115, 0.115, blue); // 팔
        block([0.40, 0.018, side * 0.20], [0.64, 0.020, side * 0.18], 0.095, 0.095, blue);
        sphere([0.68, 0.02, side * 0.18], [0.07, 0.06, 0.06], skin, false); // 주먹
    }

    block([0.18, 0, 0], [0.29, 0, 0], 0.095, 0.11, skin); // 목
    sphere([0.33, 0.015, 0], [0.12, 0.115, 0.105], skin, false); // 머리
    sphere([0.315, 0.04, 0], [0.125, 0.115, 0.11], black, true); // 머리카락
    quad([0.444, 0.018, -0.065], [0.444, 0.047, -0.065], [0.444, 0.047, -0.025], [0.444, 0.018, -0.025], black);
    quad([0.444, 0.018, 0.025], [0.444, 0.047, 0.025], [0.444, 0.047, 0.065], [0.444, 0.018, 0.065], black); // 눈

    var emblem = [[0.13, -0.099, -0.075], [0.13, -0.099, 0.075], [0.045, -0.099, 0.10], [-0.09, -0.099, 0], [0.045, -0.099, -0.10]];
    for (var e = 1; e < 4; e++) triangle(emblem[0], emblem[e], emblem[e + 1], red); // 가슴 문양
    var inner = [[0.108, -0.101, -0.05], [0.108, -0.101, 0.05], [0.045, -0.101, 0.072], [-0.055, -0.101, 0], [0.045, -0.101, -0.072]];
    for (var f = 1; f < 4; f++) triangle(inner[0], inner[f], inner[f + 1], yellow);
    quad([0.08, -0.103, -0.045], [0.08, -0.103, 0.045], [0.055, -0.103, 0.045], [0.055, -0.103, -0.045], red);
    quad([0.055, -0.103, -0.045], [0.055, -0.103, -0.02], [0.022, -0.103, 0.045], [0.022, -0.103, 0.02], red);
    quad([0.022, -0.103, -0.035], [0.022, -0.103, 0.045], [-0.004, -0.103, 0.045], [-0.004, -0.103, -0.035], red); // S 모양

    function capePoint(row, col) {
        var t = row / 4;
        var z = (col - 1) * (0.15 + 0.13 * t);
        return [0.15 - 0.77 * t, 0.11 + 0.06 * t + 0.025 * Math.sin(t * 9 + col), z];
    }
    for (var r = 0; r < 4; r++) {
        for (var c = 0; c < 2; c++) {
            var a = capePoint(r, c), b = capePoint(r + 1, c), d = capePoint(r, c + 1), h = capePoint(r + 1, c + 1);
            quad(a, b, h, d, red);
            quad(d, h, b, a, red); // 망토 양면
        }
    }

    return { positions: positions, normals: normals, colors: colors };
}; // Codex 도움 끝: 모형 정점·법선·색상 반환
