export interface Camera {
  id: string;
  name: string;
  location: string;
  url: string;
}

export const ALL_CAMERAS: Camera[] = [
  {
    id: "63b65f8dbfd3d90017eaa434",
    name: "Tp. HCM",
    location: "Xô Viết Nghệ Tĩnh - Phan Văn Hân",
    url:
      "https://giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx?id=63b65f8dbfd3d90017eaa434&t=1765179464274",
  },
  {
    id: "56df8108c062921100c143db",
    name: "Tp. HCM",
    location: "Hoàng Minh Giám - Hồng Hà",
    url:
      "https://giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx?id=56df8108c062921100c143db&t=1765520582166",
  },
  {
    id: "5a824ee15058170011f6eab6",
    name: "Tp. HCM",
    location: "Phan Văn Trị - Võ Oanh",
    url:
      "https://giaothong.hochiminhcity.gov.vn/render/ImageHandler.ashx?id=5a824ee15058170011f6eab6&t=1765520645741",
  },
];

export const CAMERAS = ALL_CAMERAS.slice(0, 0); // có thể thay đổi tham số truyền vào 0, 0 là ko có cam nào đc chọn sẵn 0, 1 là chọn 1 cam 