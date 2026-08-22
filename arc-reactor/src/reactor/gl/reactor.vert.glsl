// 정점 셰이더는 할 일이 없다. 화면을 덮는 삼각형을 그대로 통과시킨다.
// 진짜 작업은 전부 프래그먼트 셰이더에서 일어난다.
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
