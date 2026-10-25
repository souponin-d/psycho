import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

/** Separate transparent objects: their silhouette, shadow and hit area travel together. */
export function WorldItemArt({ id, size = 64 }: { id: string; size?: number }) {
  const leaf = (x: number, y: number, angle = 0) => (
    <Path
      key={`${x}-${y}`}
      d={`M${x} ${y} q-17 -26 0 -37 q17 20 0 37`}
      fill="#668B68"
      stroke="#A4BA8C"
      strokeWidth="1.3"
      transform={`rotate(${angle} ${x} ${y})`}
    />
  );
  const flower = (x: number, y: number, color = "#E7B7BD") => (
    <G key={`${x}-${y}`}>
      <Path
        d={`M${x} 82 Q${x - 8} 58 ${x} ${y}`}
        stroke="#668566"
        strokeWidth="2.5"
        fill="none"
      />
      {[0, 72, 144, 216, 288].map((a) => (
        <Ellipse
          key={a}
          cx={x}
          cy={y - 6}
          rx="4"
          ry="7"
          fill={color}
          transform={`rotate(${a} ${x} ${y})`}
        />
      ))}
      <Circle cx={x} cy={y} r="3.5" fill="#E7C569" />
    </G>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      <Defs>
        <LinearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
          <Stop stopColor="#E3C594" />
          <Stop offset="1" stopColor="#A57F58" />
        </LinearGradient>
        <LinearGradient id="stone" x1="0" y1="0" x2=".6" y2="1">
          <Stop stopColor="#F5E7C9" />
          <Stop offset="1" stopColor="#BAAB8A" />
        </LinearGradient>
        <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
          <Stop stopColor="#FFF2BC" />
          <Stop offset="1" stopColor="#E5AD65" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="50" cy="87" rx="40" ry="9" fill="#394E38" opacity=".18" />
      {id === "bench" && (
        <G>
          <Path
            d="M17 76v12m66-12v12M22 53V32m56 21V32"
            stroke="#697C68"
            strokeWidth="6"
          />
          <Rect x="13" y="31" width="74" height="22" rx="5" fill="url(#wood)" />
          <Path
            d="M13 68l66-3 11 12-75 3z"
            fill="url(#wood)"
            stroke="#F4DBAF"
            strokeWidth="2"
          />
          <Path d="M20 41h60M23 72h56" stroke="#A88357" strokeWidth="2" />
        </G>
      )}
      {(id === "flowers" || id === "lily-pot") && (
        <G>
          {id === "lily-pot" && <Path d="M30 69h40l-7 20H37z" fill="#C69D8D" />}
          {flower(34, 48)}
          {flower(53, 32, "#EDE2D4")}
          {flower(68, 54, "#C6B7DA")}
          {leaf(46, 82, -48)}
          {leaf(57, 83, 45)}
        </G>
      )}
      {id === "lantern" && (
        <G>
          <Path
            d="M50 17v70M35 85h30M35 29q15-20 30 0"
            fill="none"
            stroke="#687564"
            strokeWidth="5"
          />
          <Rect
            x="34"
            y="30"
            width="32"
            height="37"
            rx="5"
            fill="url(#glow)"
            stroke="#6A7665"
            strokeWidth="4"
          />
          <Path d="M50 32v32M34 48h32" stroke="#75806A" strokeWidth="2" />
        </G>
      )}
      {id === "tea-table" && (
        <G>
          <Path d="M31 61l-9 26m47-26 9 26" stroke="#A27A52" strokeWidth="6" />
          <Ellipse
            cx="50"
            cy="59"
            rx="40"
            ry="13"
            fill="url(#wood)"
            stroke="#F4DBAF"
            strokeWidth="2"
          />
          <Path
            d="M32 41h18v15q-9 6-18 0zM50 43q12-3 8 6l-8 2"
            fill="#F5EFE3"
            stroke="#C6B7A4"
            strokeWidth="2"
          />
          <Path
            d="M66 41q-5-7 0-13"
            stroke="#F8F2DF"
            fill="none"
            strokeWidth="3"
          />
        </G>
      )}
      {id === "cushion" && (
        <G>
          <Path
            d="M15 64q35-29 70 0v14q-35 20-70 0z"
            fill="#BBAED1"
            stroke="#DDD1E9"
            strokeWidth="3"
          />
          <Path
            d="M20 66q30 15 60 0"
            fill="none"
            stroke="#958BAE"
            strokeWidth="2"
          />
          <Circle cx="50" cy="63" r="3" fill="#9487A8" />
        </G>
      )}
      {id === "bird-bath" && (
        <G>
          <Path d="M44 57h12l6 28H38z" fill="url(#stone)" />
          <Ellipse
            cx="50"
            cy="49"
            rx="33"
            ry="14"
            fill="url(#stone)"
            stroke="#EEE1C5"
            strokeWidth="3"
          />
          <Ellipse cx="50" cy="46" rx="27" ry="8" fill="#9ABFC0" />
          <Path d="M64 32q15-17 21-3l-6 6-15-3" fill="#BAA5BF" />
          <Path d="M81 28l9 3-9 2" fill="#D1AF74" />
        </G>
      )}
      {(id === "plant-pot" || id === "fern") && (
        <G>
          {id === "plant-pot" && (
            <Path
              d="M29 67h42l-8 22H37z"
              fill="#B68E76"
              stroke="#D8BA9B"
              strokeWidth="3"
            />
          )}
          {leaf(49, 76, -42)}
          {leaf(50, 73, 0)}
          {leaf(51, 76, 44)}
          {leaf(47, 81, -75)}
          {leaf(54, 81, 76)}
        </G>
      )}
      {(id === "soft-stone" || id === "pebble-cluster") && (
        <G>
          {(id === "soft-stone"
            ? [[50, 68, 33, 20]]
            : [
                [29, 74, 17, 11],
                [64, 72, 23, 15],
                [48, 50, 18, 13],
              ]
          ).map(([x, y, rx, ry]) => (
            <Ellipse
              key={x}
              cx={x}
              cy={y}
              rx={rx}
              ry={ry}
              fill="url(#stone)"
              stroke="#F0E5CB"
              strokeWidth="2"
            />
          ))}
        </G>
      )}
      {id === "sunshade" && (
        <G>
          <Path d="M50 32v54" stroke="#A08057" strokeWidth="4" />
          <Path
            d="M8 41q42-58 84 0Q73 54 50 41Q28 54 8 41"
            fill="#CBD5AE"
            stroke="#F2E9CF"
            strokeWidth="3"
          />
          <Path
            d="M50 12Q30 25 28 46M50 12q20 13 22 34"
            fill="none"
            stroke="#A4B48D"
            strokeWidth="2"
          />
        </G>
      )}
      {id === "gazebo" && (
        <G>
          <Path
            d="M18 45v40m64-40v40M28 47v38m44-38v38"
            stroke="#C6AE88"
            strokeWidth="5"
          />
          <Path
            d="M8 45L50 10l42 35z"
            fill="#91A487"
            stroke="#D8D9B6"
            strokeWidth="3"
          />
          <Path d="M18 83h64M28 73h44" stroke="#D0B58B" strokeWidth="6" />
        </G>
      )}
      {id === "flower-arch" && (
        <G>
          <Path
            d="M21 86V45q0-56 58 0v41"
            fill="none"
            stroke="#BEAE86"
            strokeWidth="7"
          />
          {[
            [22, 50],
            [28, 28],
            [50, 19],
            [73, 29],
            [79, 52],
          ].map(([x, y]) => (
            <G key={x}>
              <Ellipse
                cx={x}
                cy={y}
                rx="10"
                ry="6"
                fill="#8EA17C"
                transform={`rotate(-30 ${x} ${y})`}
              />
              <Circle cx={x} cy={y - 3} r="6" fill="#E3C2CE" />
            </G>
          ))}
        </G>
      )}
      {id === "bookshelf" && (
        <G>
          <Rect
            x="19"
            y="26"
            width="62"
            height="58"
            rx="4"
            fill="url(#wood)"
            stroke="#E0C69F"
            strokeWidth="3"
          />
          <Path d="M23 53h54" stroke="#A0805B" strokeWidth="4" />
          {[29, 41, 53, 65].map((x, i) => (
            <G key={x}>
              <Rect
                x={x}
                y="33"
                width="8"
                height="19"
                rx="1"
                fill={["#94A68B", "#C3A5BB", "#D4BF88", "#9DB9B4"][i]}
              />
              <Rect
                x={x}
                y="60"
                width="8"
                height="18"
                rx="1"
                fill={["#D4BF88", "#9DB9B4", "#94A68B", "#C3A5BB"][i]}
              />
            </G>
          ))}
        </G>
      )}
      {id === "star-mobile" && (
        <G>
          <Path
            d="M23 85V22h54M38 22v24m19-24v35m19-35v15"
            stroke="#9EAA96"
            strokeWidth="3"
          />
          <Path
            d="m38 39 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1zm19 10 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1zm19-18 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z"
            fill="#E0C480"
          />
        </G>
      )}
      {id === "firefly-jar" && (
        <G>
          <Rect
            x="28"
            y="38"
            width="44"
            height="47"
            rx="12"
            fill="#BBD4BF"
            opacity=".85"
            stroke="#E5E8C7"
            strokeWidth="3"
          />
          <Rect x="29" y="29" width="42" height="12" rx="4" fill="url(#wood)" />
          {[
            [40, 53],
            [60, 65],
            [43, 75],
          ].map(([x, y]) => (
            <G key={x}>
              <Circle cx={x} cy={y} r="7" fill="#FFF6B5" opacity=".4" />
              <Circle cx={x} cy={y} r="2.5" fill="#FFF3A8" />
            </G>
          ))}
        </G>
      )}
      {id === "bridge" && (
        <G>
          <Path d="M9 77q41-43 82 0v9Q50 50 9 86z" fill="url(#wood)" />
          {[18, 34, 50, 66, 82].map((x) => (
            <Path
              key={x}
              d={`M${x} ${63 + Math.abs(50 - x) * 0.32}v-25`}
              stroke="#AC8B64"
              strokeWidth="4"
            />
          ))}
          <Path
            d="M16 48q34-29 68 0"
            stroke="#CBB18B"
            strokeWidth="4"
            fill="none"
          />
        </G>
      )}
      {id === "wind-chime" && (
        <G>
          <Path
            d="M50 13v12M25 32q25-15 50 0"
            stroke="#B49A72"
            fill="none"
            strokeWidth="3"
          />
          {[29, 43, 57, 71].map((x, i) => (
            <G key={x}>
              <Path d={`M${x} 31v${18 + i * 5}`} stroke="#AABA9E" />
              <Rect
                x={x - 3}
                y={47 + i * 5}
                width="6"
                height="22"
                rx="3"
                fill={["#D0BA95", "#B5C5AB", "#D6B8CC", "#C8D5C7"][i]}
              />
            </G>
          ))}
        </G>
      )}
      {id === "picnic-mat" && (
        <G>
          <Path
            d="M22 48h56l16 34H6z"
            fill="#C7ACB9"
            stroke="#F1DCD6"
            strokeWidth="3"
          />
          <Path
            d="M18 60h64M12 73h76M39 49l-5 32m27-32 5 32"
            stroke="#E9D2CB"
            strokeWidth="4"
          />
          <Path
            d="M60 64h20l-3 15H63zM64 64q6-14 12 0"
            fill="#BC986A"
            stroke="#E0BD86"
            strokeWidth="2"
          />
        </G>
      )}
    </Svg>
  );
}
