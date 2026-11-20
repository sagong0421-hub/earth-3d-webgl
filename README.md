# WebGL 지구

WebGL로 지구의 고도 지형, 자전과 조명, 슈퍼맨 공전을 표현하는 컴퓨터그래픽스 과제입니다.

## 사용 방법

프로젝트 폴더에서 HTTP 서버를 실행합니다.

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 `http://localhost:8000`을 엽니다. 시작할 때 NOAA CoastWatch API에서 고도 데이터를 받으므로 인터넷 연결이 필요합니다.

- 마우스로 드래그해 지구를 관찰하고 슬라이더로 자전, 확대, 지형과 조명을 조절합니다.
- 위도와 경도를 입력하거나 서울·오스틴 좌표를 선택한 뒤 고도를 조회합니다.
- 슈퍼맨 공전과 궤도는 체크 상자로 조절합니다.

## 파일 구성

- `index.html`: 화면과 셰이더
- `earth.js`, `earth-math.js`: API 요청, 지구 지형과 행렬, 화면 그리기
- `superman.js`: 슈퍼맨 모형
- `assets/`: 지구 색상 이미지와 출처
- `Common/`: 실행에 필요한 WebGL 공통 파일
- `참고자료.txt`: 자료 출처

## 공통 파일 출처

`Common/`의 파일은 Ed Angel과 Dave Shreiner의 WebGL 예제에서 사용하는 공통 코드입니다. 기존 수업 자료에서 가져왔으며 `Common/LICENSE.md`에 MIT 라이선스를 포함했습니다.
