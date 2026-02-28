const fs = require('fs');
const https = require('https');

function determineContinent(countryArray, textContent) {
    if (countryArray && countryArray.length > 0) {
        const countryStr = countryArray.join(" ").toLowerCase();

        if (countryStr.match(/(united kingdom|uk|england|wales|scotland|france|germany|italy|spain|russia|ukraine|poland|sweden|norway|finland|netherlands|belgium|switzerland|austria|greece|portugal|ireland|denmark|hungary|romania|bulgaria|serbia|croatia|europe|eu)/)) return 'europe';
        if (countryStr.match(/(united states|america|canada|mexico|argentina|brazil|chile|colombia|peru|venezuela|cuba|ecuador|bolivia|paraguay|uruguay|panama|costa rica|honduras|guatemala|el salvador|nicaragua|dominican|puerto rico|jamaica|haiti)/)) return 'america';
        if (countryStr.match(/(china|japan|india|korea|indonesia|pakistan|bangladesh|philippines|vietnam|turkey|iran|thailand|myanmar|iraq|afghanistan|saudi arabia|uzbekistan|malaysia|yemen|nepal|sri lanka|kazakhstan|syria|cambodia|jordan|azerbaijan|uae|united arab emirates|tajikistan|israel|lebanon|kyrgyzstan|turkmenistan|singapore|oman|kuwait|georgia|mongolia|armenia|qatar|bahrain|asia|taiwan)/)) return 'asia';
        if (countryStr.match(/(nigeria|ethiopia|egypt|congo|tanzania|south africa|kenya|uganda|algeria|sudan|morocco|angola|mozambique|ghana|madagascar|cameroon|cote|niger|burkina faso|mali|malawi|zambia|senegal|chad|somalia|zimbabwe|guinea|rwanda|benin|burundi|tunisia|south sudan|togo|sierra leone|libya|africa)/)) return 'africa';
        if (countryStr.match(/(australia|papua new guinea|new zealand|fiji|solomon islands|vanuatu|samoa|kiribati|tonga|micronesia|palau|marshall islands|tuvalu|nauru|oceania)/)) return 'oceania';
    }

    const text = textContent.toLowerCase();

    if (text.match(/(eeuu|estados unidos|america|washington|biden|trump|new york|california|texas|mexico|colombia|argentina|brasil|chile|peru|venezuela|canada|latinoamerica|sudamerica|norteamerica)/)) return 'america';
    if (text.match(/(europa|europe|reinounido|uk|london|paris|france|germany|berlin|spain|madrid|italy|rome|russia|moscow|ukraine|kiev|putin|zelensky|otan|nato|union europea)/)) return 'europe';
    if (text.match(/(asia|china|beijing|japan|tokyo|india|new delhi|pakistan|iran|israel|jerusalem|gaza|middle east|oriente medio|corea|seoul|taiwan|xi jinping|netanyahu|hamas|hezbollah|arabia|emiratos)/)) return 'asia';
    if (text.match(/(africa|sudafrica|nigeria|egypt|cairo|kenya|congo|sahel|mali|burkina|sudan)/)) return 'africa';
    if (text.match(/(australia|sydney|oceania|new zealand)/)) return 'oceania';

    return 'world';
}

const url = 'https://newsdata.io/api/1/latest?apikey=pub_fe32b0376cb54b20bcf4652ec6b44aa4&category=politics,world&language=es,en&size=50';

https.get(url, (res) => {
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
        try {
            const parsedData = JSON.parse(rawData);
            let counts = { europe: 0, america: 0, asia: 0, africa: 0, oceania: 0, world: 0 };
            parsedData.results.forEach(a => {
                const excerpt = a.description || a.content || "";
                const continent = determineContinent(a.country, a.title + " " + excerpt);
                counts[continent]++;
                if (continent === 'world') {
                    console.log("WORLD FALLBACK:", "Country:", a.country, "Title:", a.title);
                }
            });
            console.log("Continent Distribution:", counts);
        } catch (e) { console.error(e); }
    });
});
