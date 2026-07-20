// 담당자(사용자) 표기 통일 헬퍼
//
// 사용자 계정은 이름이 비어 있을 수 있어(가입 시 이메일만 받음) 화면마다
// `name || email` 같은 제각각의 처리가 흩어져 있었다. 표기를 한 곳으로 모은다.
//
// 호출부가 `journal.author` 같은 객체를 넘기기도 하고
// `{actorName, actorEmail}`처럼 필드가 흩어져 있기도 해서 두 형태를 모두 받는다.

export interface UserLike {
  name?: string | null;
  email?: string | null;
}

type NameOrUser = UserLike | string | null | undefined;

// 인자 형태(객체 / 이름+이메일 2개)를 하나로 정규화
function normalize(a: NameOrUser, b?: string | null): { name: string; email: string } {
  if (a && typeof a === 'object') {
    return { name: (a.name || '').trim(), email: (a.email || '').trim() };
  }
  return { name: (a || '').trim(), email: (b || '').trim() };
}

/**
 * 기본 표기 — 이름이 있으면 `이름 (이메일)`, 없으면 이메일만.
 * 상세 화면·수정 이력·활동 피드처럼 누가 한 일인지 명확해야 하는 곳에 쓴다.
 */
export function userLabel(user: UserLike | null | undefined): string;
export function userLabel(name: string | null | undefined, email: string | null | undefined): string;
export function userLabel(a: NameOrUser, b?: string | null): string {
  const { name, email } = normalize(a, b);
  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;
  return '알 수 없음';
}

/**
 * 축약 표기 — 이름이 있으면 이름만, 없으면 이메일의 @ 앞부분.
 * 헤더·표 셀·배지처럼 가로 폭이 좁아 이메일 전체를 넣을 수 없는 곳에 쓴다.
 */
export function userShort(user: UserLike | null | undefined): string;
export function userShort(name: string | null | undefined, email: string | null | undefined): string;
export function userShort(a: NameOrUser, b?: string | null): string {
  const { name, email } = normalize(a, b);
  if (name) return name;
  if (email) return email.split('@')[0];
  return '알 수 없음';
}

/**
 * 값이 아예 없을 때 '알 수 없음' 대신 빈 문자열을 돌려주는 변형.
 * 담당자 미지정이 정상인 목록(예: 작성자가 비어 있을 수 있는 요약 목록)에서
 * '알 수 없음'이 줄줄이 뜨는 것을 막는다.
 */
export function userLabelOrEmpty(user: UserLike | null | undefined): string;
export function userLabelOrEmpty(name: string | null | undefined, email: string | null | undefined): string;
export function userLabelOrEmpty(a: NameOrUser, b?: string | null): string {
  const { name, email } = normalize(a, b);
  if (!name && !email) return '';
  return userLabel(name, email);
}
