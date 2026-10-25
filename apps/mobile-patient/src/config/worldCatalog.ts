export type WorldItem = {
  id: string;
  name: string;
  hint: string;
  free?: boolean;
  size: number;
  max: number;
  interaction?: "sit" | "flowers" | "light" | "read";
};
export const worldItems: WorldItem[] = [
  {
    id: "bench",
    name: "Скамейка",
    hint: "Место для тихой паузы",
    free: true,
    size: 74,
    max: 2,
    interaction: "sit",
  },
  {
    id: "flowers",
    name: "Полевые цветы",
    hint: "Для любого настроения",
    free: true,
    size: 52,
    max: 3,
    interaction: "flowers",
  },
  {
    id: "lantern",
    name: "Фонарь",
    hint: "Немного тёплого света",
    free: true,
    size: 52,
    max: 3,
    interaction: "light",
  },
  {
    id: "tea-table",
    name: "Чайный столик",
    hint: "Неспешный вечер",
    free: true,
    size: 68,
    max: 2,
    interaction: "sit",
  },
  {
    id: "cushion",
    name: "Подушка",
    hint: "Мягкое место для спутника",
    free: true,
    size: 52,
    max: 3,
    interaction: "sit",
  },
  {
    id: "bird-bath",
    name: "Поилка для птиц",
    hint: "Маленькие гости рядом",
    free: true,
    size: 58,
    max: 2,
  },
  {
    id: "plant-pot",
    name: "Растение в горшке",
    hint: "Зелёный уголок",
    free: true,
    size: 56,
    max: 3,
  },
  {
    id: "soft-stone",
    name: "Тёплый камень",
    hint: "Нагретый солнцем",
    free: true,
    size: 56,
    max: 3,
  },
  {
    id: "pebble-cluster",
    name: "Речная галька",
    hint: "Первый выполненный день",
    size: 54,
    max: 3,
  },
  {
    id: "fern",
    name: "Папоротник",
    hint: "Три выполненных дня",
    size: 58,
    max: 3,
  },
  {
    id: "sunshade",
    name: "Солнечный зонт",
    hint: "Пять выполненных дней",
    size: 84,
    max: 1,
    interaction: "sit",
  },
  {
    id: "gazebo",
    name: "Беседка",
    hint: "Десять выполненных дней",
    size: 94,
    max: 1,
    interaction: "sit",
  },
  {
    id: "lily-pot",
    name: "Лилии",
    hint: "Три полных самоотчёта",
    size: 58,
    max: 3,
    interaction: "flowers",
  },
  {
    id: "flower-arch",
    name: "Цветочная арка",
    hint: "Семь полных самоотчётов",
    size: 88,
    max: 1,
  },
  {
    id: "bookshelf",
    name: "Книжная полка",
    hint: "Первый назначенный опрос",
    size: 66,
    max: 2,
    interaction: "read",
  },
  {
    id: "star-mobile",
    name: "Звёздный мобиль",
    hint: "Два назначенных опроса",
    size: 64,
    max: 2,
  },
  {
    id: "firefly-jar",
    name: "Баночка светлячков",
    hint: "Стрик из трёх дней",
    size: 50,
    max: 3,
    interaction: "light",
  },
  {
    id: "bridge",
    name: "Деревянный мостик",
    hint: "Стрик из семи дней",
    size: 86,
    max: 1,
  },
  {
    id: "wind-chime",
    name: "Музыка ветра",
    hint: "Расставьте четыре предмета",
    size: 58,
    max: 2,
  },
  {
    id: "picnic-mat",
    name: "Плед для пикника",
    hint: "Семь календарных дней на пути",
    size: 78,
    max: 2,
    interaction: "sit",
  },
];
export type AchievementMetric =
  "days" | "reports" | "tests" | "streak" | "placed" | "calendar";
export const achievementCatalog: {
  id: string;
  name: string;
  metric: AchievementMetric;
  target: number;
  itemId: string;
}[] = [
  {
    id: "first-day",
    name: "Первый шаг",
    metric: "days",
    target: 1,
    itemId: "pebble-cluster",
  },
  {
    id: "three-days",
    name: "Нахожу ритм",
    metric: "days",
    target: 3,
    itemId: "fern",
  },
  {
    id: "five-days",
    name: "Пять шагов",
    metric: "days",
    target: 5,
    itemId: "sunshade",
  },
  {
    id: "ten-days",
    name: "Продолжаю путь",
    metric: "days",
    target: 10,
    itemId: "gazebo",
  },
  {
    id: "three-reports",
    name: "Замечаю себя",
    metric: "reports",
    target: 3,
    itemId: "lily-pot",
  },
  {
    id: "seven-reports",
    name: "Дневник ощущений",
    metric: "reports",
    target: 7,
    itemId: "flower-arch",
  },
  {
    id: "first-test",
    name: "Время для опроса",
    metric: "tests",
    target: 1,
    itemId: "bookshelf",
  },
  {
    id: "two-tests",
    name: "Следую назначениям",
    metric: "tests",
    target: 2,
    itemId: "star-mobile",
  },
  {
    id: "streak-three",
    name: "Три дня подряд",
    metric: "streak",
    target: 3,
    itemId: "firefly-jar",
  },
  {
    id: "streak-seven",
    name: "Неделя в ритме",
    metric: "streak",
    target: 7,
    itemId: "bridge",
  },
  {
    id: "my-place",
    name: "Мой уголок",
    metric: "placed",
    target: 4,
    itemId: "wind-chime",
  },
  {
    id: "first-week",
    name: "Неделя знакомства",
    metric: "calendar",
    target: 7,
    itemId: "picnic-mat",
  },
];
export type SceneDefinition = {
  name: string;
  stones: readonly (readonly [number, number])[];
};
export const scenes: Record<"shore" | "garden", SceneDefinition> = {
  shore: {
    name: "Живой берег",
    stones: [
      [0.58, 0.81],
      [0.42, 0.637],
      [0.7, 0.51],
      [0.36, 0.386],
      [0.75, 0.3],
      [0.28, 0.22],
      [0.49, 0.158],
      [0.76, 0.1],
      [0.63, 0.046],
    ],
  },
  garden: {
    name: "Тихий сад",
    stones: [
      [0.58, 0.875],
      [0.49, 0.72],
      [0.75, 0.585],
      [0.31, 0.437],
      [0.69, 0.34],
      [0.38, 0.25],
      [0.51, 0.175],
      [0.69, 0.12],
      [0.62, 0.067],
    ],
  },
};
export const wardrobe = {
  colors: [
    { id: "sage", name: "Шалфей", hex: "#C7D6AE" },
    { id: "lavender", name: "Лаванда", hex: "#DCC8EF" },
    { id: "pearl", name: "Жемчуг", hex: "#F8EDCF" },
  ],
  clothing: [
    { id: "scarf", name: "Шарф" },
    { id: "hoodie", name: "Худи" },
    { id: "cape", name: "Накидка" },
  ],
  accessories: [
    { id: "none", name: "Без аксессуара" },
    { id: "leaf", name: "Листок" },
    { id: "star", name: "Звезда" },
    { id: "bow", name: "Бант" },
  ],
};
