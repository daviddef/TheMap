/* Realistic stories for the plan audit: how people actually write, not the reader's own idiom. Names are made up. */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const dez = fs.readFileSync(fileURLToPath(new URL("./drezhik-story.txt", import.meta.url)), "utf8").trim();
export const STORIES = [
  { id: "dreznik", t: dez },
  { id: "hr-village", t: "My grandfather Mate Radić was born in 1921 in Gračišće in Istria. He left for Australia in 1950 on a ship from Genoa and worked in the cane fields in Queensland. His brother stayed. I don't know his parents' names, only that the family was farmers." },
  { id: "it-friuli", t: "My nonna Maria Zanier was born in Ovaro, Friuli, in 1903. Her father Giovanni was a stonemason and went to Argentina around 1912. She followed him to Buenos Aires in 1925 with her mother and married there. I would love to find her baptism." },
  { id: "si-gorenjska", t: "My great-grandmother Marija Kos came from Bled in Slovenia, born about 1890. She married Janez Zupan in 1912 and they moved to Trieste, then to Cleveland, Ohio in 1923. We know nothing about her parents." },
  { id: "at-burgenland", t: "Johann Horvath was born in 1887 in Nikitsch, Burgenland, which was Hungary then. He emigrated to New York in 1907 and became a citizen in 1915. His wife was Anna Szabo from Güssing." },
  { id: "pl-galicia", t: "My great-grandfather Wojciech Nowak was born in 1880 near Tarnów in Galicia. He went to Pittsburgh in 1904 and worked in the steel mills. He died in 1941. I don't know the village." },
  { id: "cz-bohemia-jewish", t: "My great-grandmother Berta Kohn, born 1885 in Pilsen, Bohemia, was Jewish. Her family moved to Vienna in 1910. She was deported from Vienna in 1942 and I don't know what happened to her parents." },
  { id: "ie-cork", t: "My grandfather Patrick Murphy was born in 1898 near Skibbereen in County Cork. He went to Boston in 1920. His mother was Ellen Sullivan. I would like to find his baptism and the townland." },
  { id: "sc-glasgow", t: "My great-grandfather Angus MacLeod was born in 1875 on the Isle of Lewis. He moved to Glasgow in 1901 and then to Toronto in 1911. His wife was Catherine Morrison." },
  { id: "de-silesia", t: "My grandmother Helene Wolf was born in 1928 in Breslau, Silesia. In 1946 the family was expelled and went to Bavaria, then she emigrated to Canada in 1953. I know her father was Karl Wolf." },
  { id: "ar-arrival", t: "My abuelo Giuseppe Lerena arrived in Buenos Aires from Genoa in 1889 when he was 19. He was born in Rapallo in Liguria. He married Rosa Bianchi in 1895 in Montevideo." },
  { id: "us-ellis", t: "My great-grandfather Luka Marinović left Dubrovnik in 1906 and arrived at Ellis Island, then worked in the mines in Butte, Montana. He married in 1912 and died in 1951 in Butte." },
  { id: "maiden", t: "My great-grandmother was Ana Perković, born Matković, in Imotski, Dalmatia in 1892. She married in 1914 and her husband went to Chile in 1927. She stayed with the children." },
  { id: "au-emigrant", t: "My grandfather Stjepan Bilić was born in 1930 in Tučepi near Makarska. In 1958 he emigrated to Melbourne, Australia. His wife Marija joined him in 1960." },
];
