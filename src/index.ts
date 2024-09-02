import puppeteer, { Browser } from 'puppeteer';
import * as cheerio from 'cheerio';
import * as fs from 'fs';

interface RequestParameter {
    Type: string;
    Mandatory: string;
    Description: string;
}

interface PageData {
    h1Text: string;
    weight: string;
    method: string;
    urlPath: string;
    requestParameters: Record<string, RequestParameter>;
    respType: string;
    respComments: string;
}

async function getAllLinks(url: string, browser: Browser): Promise<string[]> {
    const page = await browser.newPage();
    
    await page.goto(url);

    const links = await page.evaluate(() => {
        const linkElements = document.querySelectorAll('li.theme-doc-sidebar-item-link.theme-doc-sidebar-item-link-level-1.menu__list-item a') as NodeListOf<HTMLAnchorElement>;
        const subMenuLinkElements = document.querySelectorAll('li.theme-doc-sidebar-item-category.theme-doc-sidebar-item-category-level-1.menu__list-item.menu__list-item--collapsed .menu__list-item-collapsible a' || '') as NodeListOf<HTMLAnchorElement>;
        
        const allLinks = [
            ...Array.from(linkElements).map(a => a.href),
            ...Array.from(subMenuLinkElements).map(a => a.href)
        ];

        return allLinks;
    });

    const getSubMenuLinks = async (url: string) => {
        const page = await browser.newPage();
        await page.goto(url);
        const subMenuLinks = await page.evaluate(() => {
            const subMenuItems = document.querySelectorAll('li.theme-doc-sidebar-item-category.theme-doc-sidebar-item-category-level-1.menu__list-item ul.menu__list li.theme-doc-sidebar-item-link.theme-doc-sidebar-item-link-level-2.menu__list-item a') as NodeListOf<HTMLAnchorElement>;
            return Array.from(subMenuItems).map(a => a.href);
        });
        await page.close();
        return subMenuLinks;
    };

    let allLinks: string[] = [...links];

    for (const link of links) {
        const subMenuLinks = await getSubMenuLinks(link);
        allLinks = [...allLinks, ...subMenuLinks];
    }

    await page.close();
    return allLinks;
}


async function processPageData(content: string, url: string): Promise<PageData | null> {
    const $ = cheerio.load(content);

    let h1Text: string = '';
    let weight: string = '';
    let method: string = '';
    let urlPath: string = '';
    const requestParameters: Record<string, RequestParameter> = {};
    let respType: string = '';
    let respComments: string = '';

    try {
        h1Text = $('h1').text().trim();
        h1Text = h1Text.replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, '_');
        h1Text = h1Text.replace(/['"]/g, '');
        h1Text = h1Text.replace(/[-]/g, '');
        h1Text = h1Text.replace(/[/]/g, '');
        h1Text = h1Text.replace(/[:]/g, '');

        weight = $('#request-weightip').next('p').find('strong').text().trim();
        if (weight === '') {
            weight = $('#request-weight').next('p').find('strong').text().trim();
        }

        const httpRequestBlock = $('#http-request').next('p');
        if (httpRequestBlock.length > 0) {
            const httpRequestText = httpRequestBlock.text().trim();
            [method, urlPath] = httpRequestText.split(' ');
        } else {
            console.log("HTTP method and URL block is missing. Skipping this method.");
            return null;
        }

        $('table tbody tr').each((index, element) => {
            const name = $(element).find('td').eq(0).text().trim();
            let type = $(element).find('td').eq(1).text().trim().toLowerCase();
            const mandatory = $(element).find('td').eq(2).text().trim();
            const description = $(element).find('td').eq(3).text().trim();

            if (type === 'long' || type === 'int' || type === 'integer' || type === 'decimal') {
                type = 'number';
            }

            if (type === 'enum' || type === 'array') {
                type = '[]';
            }

            requestParameters[name] = {
                Type: type,
                Mandatory: mandatory,
                Description: description,
            };
        });

        const lastResponseBlock = $('.prism-code.language-javascript.codeBlock_hldk.thin-scrollbar').last();
        let codeBlockContentFirst = lastResponseBlock.find('code').text().trim();

        if (codeBlockContentFirst.length === 0) {
            console.warn(`No response example block found on page: ${url}`);
            respType = '';
            respComments = ' * @returns {void} - No response example provided.';
        } else {
            let codeBlockContent = codeBlockContentFirst.replace(/\/\/.*?(?=\s*"\w+":|[}\{\[\]])/g, '');

            codeBlockContent = codeBlockContent.replace(/,\s*([\}\]])/g, '$1');
            codeBlockContent = codeBlockContent.replace(/"(\w+)"\s*"(\w+)":/g, '"$1","$2":');
            codeBlockContent = codeBlockContent.replace(/(?<![\}\]])\s*([\}\]])\s*(?=\{|\[|\d|".*?[^"]")/g, '$1,');
            codeBlockContent = codeBlockContent.replace(/[“”]/g, '"');

            let responseExample;
            if (codeBlockContent.startsWith('[')) {
                responseExample = JSON.parse(codeBlockContent);
            } else {
                responseExample = [JSON.parse(codeBlockContent)];
            }

            respType = Object.entries(responseExample[0])
                .map(([key, value]) => `${key}: ${typeof value}`)
                .join(', ');

            respComments = Object.entries(responseExample[0])
                .map(([key, value]) => ` * @returns {${typeof value}} ${key} - The ${key} property of type ${typeof value}`)
                .join('\n');
        }

        return {
            h1Text,
            weight,
            method,
            urlPath,
            requestParameters,
            respType,
            respComments
        };

    } catch (error: unknown) {
        console.error(`Error in processPageData for page: ${url}`);
        if (error instanceof SyntaxError) {
            console.error(`SyntaxError: ${error.message}`);
        } else if (error instanceof TypeError) {
            console.error(`TypeError: ${error.message}`);
        } else if (error instanceof Error) {
            console.error(`Unknown error: ${error.message}`);
        }
        throw error;
    }
}

function getObjectNameFromUrl(url: string): string {
    const segments = url.split('/');
    const docsIndex = segments.indexOf('docs');
    
    if (docsIndex !== -1 && docsIndex < segments.length - 1) {
        return segments[docsIndex + 1].replace(/\W/g, ''); 
    }
    
    return 'defaultObjectName';
}

async function createNewMethod(url: string, browser: Browser) {
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        const content = await page.content();
        const pageData = await processPageData(content, url);

        if (!pageData) {
            console.log(`Skipping method creation for page: ${url} due to missing HTTP method and URL.`);
            return;
        }

        const filePath = './src/methods/NewMethods2.ts';

        let fileContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';

        if (!fileContent.includes('class ApiMethods')) {
            fileContent = `class ApiMethods {\n}\n`;
            fs.writeFileSync(filePath, fileContent);
        }

        const objectName = getObjectNameFromUrl(url);

        if (!fileContent.includes(`${objectName} =`)) {
            const updatedFileContent = fileContent.replace('class ApiMethods {', `class ApiMethods {\n    ${objectName} = {};\n`);
            fs.writeFileSync(filePath, updatedFileContent);
            fileContent = updatedFileContent;
        }

        const methodString = `
    /**
     * ${pageData.h1Text}
     *
     * @param {Object} req - An object containing request parameters.
${Object.entries(pageData.requestParameters).map(([key, value]) => {
            return `     * @param {${value.Type}} req.${key} - ${value.Description}`;
        }).join('\n')}
     * @returns {Object} resp - An object containing response parameters.
${pageData.respComments}
     */
    ${pageData.h1Text}() {
        return {
            req: {} as {${Object.entries(pageData.requestParameters).map(([key, value]) => {
            return `${key}: ${value.Type}`;
        }).join(', ')}},
            resp: {} as {${pageData.respType}},
            weight: '${pageData.weight}',  
            address: {
                url: '${pageData.urlPath}',
                method: '${pageData.method}'
            }
        };
    }
`;

        if (!fileContent.includes(`${pageData.h1Text}()`)) {
            const newFileContent = fileContent.replace(new RegExp(`${objectName}\\s*=\\s*{`), `${objectName} = {\n${methodString.trim()},`);
            fs.writeFileSync(filePath, newFileContent);
            console.log(`Method ${pageData.h1Text} successfully added to the ${objectName} property in NewMethods.ts`);
        } else {
            console.log(`Method ${pageData.h1Text} already exists in NewMethods.ts`);
        }

    } catch (error: unknown) {
        console.error(`Error loading page: ${url}`);
        if (error instanceof Error) {
            console.error(`Error message: ${error.message}`);
        } else {
            console.error('Unknown error occurred');
        }
    }

    await page.close();
}

async function getLinksFromProductPanel(url: string, browser: Browser): Promise<string[]> {
    const page = await browser.newPage();
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        const links = await page.evaluate(() => {
            const linkElements = document.querySelectorAll('.productPanel_ogDY a') as NodeListOf<HTMLAnchorElement>;
            return Array.from(linkElements).map(a => a.href);
        });

        return links;
    } catch (error) {
        console.error(`Error getting links from product panel on page: ${url}`);
        throw error;
    } finally {
        await page.close();
    }
}

async function processAllLinks() {
    const browser = await puppeteer.launch({ headless: true });

    try {
        const changelogUrl = 'https://developers.binance.com/docs/binance-spot-api-docs/CHANGELOG';
        const changelogLinks = await getLinksFromProductPanel(changelogUrl, browser);
        let links: string[] = []

        for (const link of changelogLinks) {
            console.log(link)
            links = await getAllLinks(link, browser);
            await Promise.all(links.map(link => createNewMethod(link, browser)));
        }
    } catch (error) {
        console.error('Error in processAllLinks: ', error);
    } finally {
        await browser.close();
    }
}

processAllLinks().catch(console.error);

