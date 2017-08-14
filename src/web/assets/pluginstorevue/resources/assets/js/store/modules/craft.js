import api from '../../api'
import * as types from '../mutation-types'

const state = {
    craftData: {},
    // installedPlugins: JSON.parse(window.localStorage.getItem('craft.installedPlugins') || '[]')
}

const getters = {
    installedPlugins: (state, rootState) => {
        return rootState.allPlugins.filter(p => {
            return state.craftData.installedPlugins.find(pluginId => pluginId == p.id);
        })
    },
    craftIdAccount: state => {
        return state.craftData.craftId
    },
    countries: state => {
        return state.craftData.countries;
    },
    states: state => {
        return state.craftData.states;
    }
}

const actions = {
    installPlugin({ dispatch, commit }, plugin) {
        commit(types.INSTALL_PLUGIN, plugin)
        dispatch('saveCraftData');
    },

    getCraftData ({ commit }) {
        return new Promise((resolve, reject) => {
            api.getCraftData(data => {
                commit(types.RECEIVE_CRAFT_DATA, { data })
                resolve(data);
            })
        })
    },

    saveCraftData({ commit, state }) {
        api.saveCraftData(() => {
            commit(types.SAVE_CRAFT_DATA);
        }, state.craftData)
    },

    clearCraftData ({ commit }) {
        return new Promise((resolve, reject) => {
            api.clearCraftData(data => {
                commit(types.CLEAR_CRAFT_DATA, { data })
                resolve(data);
            })
        })
    },
}

const mutations = {
    [types.INSTALL_PLUGIN] (state, { plugin }) {
        const record = state.craftData.installedPlugins.find(pluginId => pluginId === plugin.id)

        if (!record) {
            state.craftData.installedPlugins.push(plugin.id)
        }
    },
    [types.RECEIVE_CRAFT_DATA] (state, { data }) {
        state.craftData = data
    },
    [types.SAVE_CRAFT_DATA] (state) {

    },
    [types.CLEAR_CRAFT_DATA] (state) {

    },
}

export default {
    state,
    getters,
    actions,
    mutations,
}
