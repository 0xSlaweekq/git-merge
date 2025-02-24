import axios from 'axios'
import * as dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import simpleGit from 'simple-git'

const envConfig = dotenv.config({ path: path.resolve('./', '.env') })
const { OLD_ACCOUNT, NEW_ACCOUNT, OLD_TOKEN, NEW_TOKEN, TEMP_DIR, GIT_USER_NAME, GIT_USER_EMAIL } = envConfig.parsed || {}

// Функция для получения списка репозиториев
async function getRepositories(account: string, token: string): Promise<string[]> {
    try {
        const response = await axios.get(`https://api.github.com/users/${account}/repos?per_page=100`, {
            headers: {
                Authorization: `token ${token}`,
            },
        })

        return response.data.map((repo: any) => repo.name)
    } catch (error) {
        console.error('Ошибка при получении списка репозиториев:', error)
        return []
    }
}

// Функция для создания репозитория на новом аккаунте
async function createRepository(repoName: string, token: string): Promise<void> {
    try {
        await axios.post(
            `https://api.github.com/user/repos`,
            {
                name: repoName,
                private: false,
            },
            {
                headers: {
                    Authorization: `token ${token}`,
                },
            },
        )
        console.log(`Репозиторий ${repoName} создан на новом аккаунте.`)
    } catch (error) {
        console.error(`Ошибка при создании репозитория ${repoName}:`, error)
    }
}

// Функция для переноса репозитория
async function transferRepository(repoName: string): Promise<void> {
    const repoPath = path.join(TEMP_DIR, repoName)
    const oldRepoUrl = `https://${OLD_TOKEN}@github.com/${OLD_ACCOUNT}/${repoName}.git`
    const newRepoUrl = `https://${NEW_TOKEN}@github.com/${NEW_ACCOUNT}/${repoName}.git`

    try {
        // Убедиться, что директория существует
        await fs.mkdir(repoPath, { recursive: true })

        // Инициализация simple-git для конкретного репозитория
        const git = simpleGit(repoPath)

        // Добавить директорию в безопасный список
        await simpleGit().addConfig('safe.directory', repoPath)

        // Клонирование репозитория
        console.log(`Клонирование репозитория ${repoName}...`)
        await simpleGit().clone(oldRepoUrl, repoPath, ['--bare'])

        // Установка конфигурации пользователя
        await git.addConfig('user.name', GIT_USER_NAME)
        await git.addConfig('user.email', GIT_USER_EMAIL)

        // Установка нового удалённого адреса
        console.log(`Настройка нового удалённого репозитория ${repoName}...`)
        await git.remote(['set-url', 'origin', newRepoUrl])

        // Публикация на новый аккаунт
        console.log(`Перенос репозитория ${repoName}...`)
        await git.push(['--mirror', newRepoUrl, '--no-verify'])

        console.log(`Репозиторий ${repoName} успешно перенесён.`)
    } catch (error) {
        console.error(`Ошибка при переносе репозитория ${repoName}:`, error)
    } finally {
        // Удаление временной директории
        await fs.rm(repoPath, { recursive: true, force: true })
    }
}

// Функция для удаления репозитория
async function deleteRepository(repoName: string, token: string, account: string): Promise<void> {
    try {
        await axios.delete(`https://api.github.com/repos/${account}/${repoName}`, {
            headers: {
                Authorization: `token ${token}`,
            },
        })
        console.log(`Репозиторий ${repoName} успешно удалён с аккаунта ${account}.`)
    } catch (error) {
        console.error(`Ошибка при удалении репозитория ${repoName}:`, error)
    }
}

// Основной процесс
;(async function main() {
    try {
        // Создание временной директории
        await fs.mkdir(TEMP_DIR, { recursive: true })

        // Получение списка репозиториев
        const repositories = await getRepositories(OLD_ACCOUNT, OLD_TOKEN)
        console.log({
            repositories,
        })
        for (const repoName of repositories) {
            // Создание репозитория на новом аккаунте
            // await createRepository(repoName, NEW_TOKEN)

            // Перенос репозитория
            await transferRepository(repoName)

            // Удаление старого репозитория
            // await deleteRepository(repoName, NEW_TOKEN, NEW_ACCOUNT)
        }

        console.log('Все репозитории успешно перенесены и старые удалены!')
    } catch (error) {
        console.error('Произошла ошибка:', error)
    } finally {
        await fs.rm(TEMP_DIR, { recursive: true, force: true })
    }
})()
