import { indexAllFolders, scanProjects } from '../services/project-discovery-service'
import { searchIndexedPaths } from '../services/file-index-service'

export const devscopeCore = {
    projects: {
        scanProjects,
        indexAllFolders,
        searchIndexedPaths
    }
}
