// Published OpenAI token rates; refreshed from the official pricing tables.
export default {
  "version": 1,
  "source": "https://developers.openai.com/api/docs/pricing",
  "fetchedAt": "2026-09-29T23:45:46.430Z",
  "models": {
    "gpt-6-astra": {
      "tiers": {
        "standard": {
          "short": {
            "input": 10,
            "cacheRead": 1,
            "cacheWrite": 12.5,
            "output": 50
          },
          "long": {
            "input": 20,
            "cacheRead": 2,
            "cacheWrite": 25,
            "output": 75
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 5,
            "cacheRead": 0.5,
            "cacheWrite": 6.25,
            "output": 25
          },
          "long": {
            "input": 10,
            "cacheRead": 1,
            "cacheWrite": 12.5,
            "output": 37.5
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 5,
            "cacheRead": 0.5,
            "cacheWrite": 6.25,
            "output": 25
          },
          "long": {
            "input": 10,
            "cacheRead": 1,
            "cacheWrite": 12.5,
            "output": 37.5
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 20,
            "cacheRead": 2,
            "cacheWrite": 25,
            "output": 100
          },
          "long": {
            "input": 40,
            "cacheRead": 4,
            "cacheWrite": 50,
            "output": 150
          },
          "inputTokensAbove": 272000
        },
        "ultrafast": {
          "short": {
            "input": 60,
            "cacheRead": 6,
            "cacheWrite": 75,
            "output": 300
          },
          "long": {
            "input": 120,
            "cacheRead": 12,
            "cacheWrite": 150,
            "output": 450
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-6.1-sol": {
      "tiers": {
        "standard": {
          "short": {
            "input": 2,
            "cacheRead": 0.1,
            "cacheWrite": 2.5,
            "output": 10
          },
          "long": {
            "input": 4,
            "cacheRead": 0.2,
            "cacheWrite": 5,
            "output": 15
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1,
            "cacheRead": 0.05,
            "cacheWrite": 1.25,
            "output": 5
          },
          "long": {
            "input": 2,
            "cacheRead": 0.1,
            "cacheWrite": 2.5,
            "output": 7.5
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 1,
            "cacheRead": 0.05,
            "cacheWrite": 1.25,
            "output": 5
          },
          "long": {
            "input": 2,
            "cacheRead": 0.1,
            "cacheWrite": 2.5,
            "output": 7.5
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 4,
            "cacheRead": 0.2,
            "cacheWrite": 5,
            "output": 20
          },
          "long": {
            "input": 8,
            "cacheRead": 0.4,
            "cacheWrite": 10,
            "output": 30
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-6-luna": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.1,
            "cacheRead": 0.01,
            "cacheWrite": 0.125,
            "output": 0.5
          },
          "long": {
            "input": 0.2,
            "cacheRead": 0.02,
            "cacheWrite": 0.25,
            "output": 0.75
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.05,
            "cacheRead": 0.005,
            "cacheWrite": 0.0625,
            "output": 0.25
          },
          "long": {
            "input": 0.1,
            "cacheRead": 0.01,
            "cacheWrite": 0.125,
            "output": 0.375
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.05,
            "cacheRead": 0.005,
            "cacheWrite": 0.0625,
            "output": 0.25
          },
          "long": {
            "input": 0.1,
            "cacheRead": 0.01,
            "cacheWrite": 0.125,
            "output": 0.375
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 0.2,
            "cacheRead": 0.02,
            "cacheWrite": 0.25,
            "output": 1
          },
          "long": {
            "input": 0.4,
            "cacheRead": 0.04,
            "cacheWrite": 0.5,
            "output": 1.5
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-6-sol": {
      "tiers": {
        "standard": {
          "short": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 10
          },
          "long": {
            "input": 4,
            "cacheRead": 0.4,
            "cacheWrite": 5,
            "output": 15
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1,
            "cacheRead": 0.1,
            "cacheWrite": 1.25,
            "output": 5
          },
          "long": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 7.5
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 1,
            "cacheRead": 0.1,
            "cacheWrite": 1.25,
            "output": 5
          },
          "long": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 7.5
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 4,
            "cacheRead": 0.4,
            "cacheWrite": 5,
            "output": 20
          },
          "long": {
            "input": 8,
            "cacheRead": 0.8,
            "cacheWrite": 10,
            "output": 30
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.6-sol": {
      "tiers": {
        "standard": {
          "short": {
            "input": 4,
            "cacheRead": 0.4,
            "cacheWrite": 5,
            "output": 20
          },
          "long": {
            "input": 8,
            "cacheRead": 0.8,
            "cacheWrite": 10,
            "output": 30
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 10
          },
          "long": {
            "input": 4,
            "cacheRead": 0.4,
            "cacheWrite": 5,
            "output": 15
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 10
          },
          "long": {
            "input": 4,
            "cacheRead": 0.4,
            "cacheWrite": 5,
            "output": 15
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 8,
            "cacheRead": 0.8,
            "cacheWrite": 10,
            "output": 40
          },
          "long": {
            "input": 16,
            "cacheRead": 1.6,
            "cacheWrite": 20,
            "output": 60
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.6-terra": {
      "tiers": {
        "standard": {
          "short": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 12
          },
          "long": {
            "input": 4,
            "cacheRead": 0.4,
            "cacheWrite": 5,
            "output": 18
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1,
            "cacheRead": 0.1,
            "cacheWrite": 1.25,
            "output": 6
          },
          "long": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 9
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 1,
            "cacheRead": 0.1,
            "cacheWrite": 1.25,
            "output": 6
          },
          "long": {
            "input": 2,
            "cacheRead": 0.2,
            "cacheWrite": 2.5,
            "output": 9
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 4,
            "cacheRead": 0.4,
            "cacheWrite": 5,
            "output": 24
          },
          "long": {
            "input": 8,
            "cacheRead": 0.8,
            "cacheWrite": 10,
            "output": 36
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.6-luna": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.2,
            "cacheRead": 0.02,
            "cacheWrite": 0.25,
            "output": 1.2
          },
          "long": {
            "input": 0.4,
            "cacheRead": 0.04,
            "cacheWrite": 0.5,
            "output": 1.8
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.1,
            "cacheRead": 0.01,
            "cacheWrite": 0.125,
            "output": 0.6
          },
          "long": {
            "input": 0.2,
            "cacheRead": 0.02,
            "cacheWrite": 0.25,
            "output": 0.9
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.1,
            "cacheRead": 0.01,
            "cacheWrite": 0.125,
            "output": 0.6
          },
          "long": {
            "input": 0.2,
            "cacheRead": 0.02,
            "cacheWrite": 0.25,
            "output": 0.9
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 0.4,
            "cacheRead": 0.04,
            "cacheWrite": 0.5,
            "output": 2.4
          },
          "long": {
            "input": 0.8,
            "cacheRead": 0.08,
            "cacheWrite": 1,
            "output": 3.6
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.5": {
      "tiers": {
        "standard": {
          "short": {
            "input": 5,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 30
          },
          "long": {
            "input": 10,
            "cacheRead": 1,
            "cacheWrite": null,
            "output": 45
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 2.5,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 15
          },
          "long": {
            "input": 5,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 22.5
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 2.5,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 15
          },
          "long": {
            "input": 5,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 22.5
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 12.5,
            "cacheRead": 1.25,
            "cacheWrite": null,
            "output": 75
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.5-pro": {
      "tiers": {
        "standard": {
          "short": {
            "input": 30,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 180
          },
          "long": {
            "input": 60,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 270
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 15,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 90
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 15,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 90
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.4": {
      "tiers": {
        "standard": {
          "short": {
            "input": 2.5,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 15
          },
          "long": {
            "input": 5,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 22.5
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1.25,
            "cacheRead": 0.13,
            "cacheWrite": null,
            "output": 7.5
          },
          "long": {
            "input": 2.5,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 11.25
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 1.25,
            "cacheRead": 0.13,
            "cacheWrite": null,
            "output": 7.5
          },
          "long": {
            "input": 2.5,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 11.25
          },
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 5,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 30
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.4-mini": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.75,
            "cacheRead": 0.075,
            "cacheWrite": null,
            "output": 4.5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.375,
            "cacheRead": 0.0375,
            "cacheWrite": null,
            "output": 2.25
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.375,
            "cacheRead": 0.0375,
            "cacheWrite": null,
            "output": 2.25
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 1.5,
            "cacheRead": 0.15,
            "cacheWrite": null,
            "output": 9
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.4-nano": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.2,
            "cacheRead": 0.02,
            "cacheWrite": null,
            "output": 1.25
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.1,
            "cacheRead": 0.01,
            "cacheWrite": null,
            "output": 0.625
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.1,
            "cacheRead": 0.01,
            "cacheWrite": null,
            "output": 0.625
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.4-pro": {
      "tiers": {
        "standard": {
          "short": {
            "input": 30,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 180
          },
          "long": {
            "input": 60,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 270
          },
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 15,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 90
          },
          "long": {
            "input": 30,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 135
          },
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 15,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 90
          },
          "long": {
            "input": 30,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 135
          },
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.2": {
      "tiers": {
        "standard": {
          "short": {
            "input": 1.75,
            "cacheRead": 0.175,
            "cacheWrite": null,
            "output": 14
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.875,
            "cacheRead": 0.0875,
            "cacheWrite": null,
            "output": 7
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.875,
            "cacheRead": 0.0875,
            "cacheWrite": null,
            "output": 7
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 3.5,
            "cacheRead": 0.35,
            "cacheWrite": null,
            "output": 28
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.2-pro": {
      "tiers": {
        "standard": {
          "short": {
            "input": 21,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 168
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 10.5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 84
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5.1": {
      "tiers": {
        "standard": {
          "short": {
            "input": 1.25,
            "cacheRead": 0.125,
            "cacheWrite": null,
            "output": 10
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.625,
            "cacheRead": 0.0625,
            "cacheWrite": null,
            "output": 5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.625,
            "cacheRead": 0.0625,
            "cacheWrite": null,
            "output": 5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 2.5,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 20
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5": {
      "tiers": {
        "standard": {
          "short": {
            "input": 1.25,
            "cacheRead": 0.125,
            "cacheWrite": null,
            "output": 10
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.625,
            "cacheRead": 0.0625,
            "cacheWrite": null,
            "output": 5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.625,
            "cacheRead": 0.0625,
            "cacheWrite": null,
            "output": 5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 2.5,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 20
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5-mini": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.25,
            "cacheRead": 0.025,
            "cacheWrite": null,
            "output": 2
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.125,
            "cacheRead": 0.0125,
            "cacheWrite": null,
            "output": 1
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.125,
            "cacheRead": 0.0125,
            "cacheWrite": null,
            "output": 1
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 0.45,
            "cacheRead": 0.045,
            "cacheWrite": null,
            "output": 3.6
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5-nano": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.05,
            "cacheRead": 0.005,
            "cacheWrite": null,
            "output": 0.4
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.025,
            "cacheRead": 0.0025,
            "cacheWrite": null,
            "output": 0.2
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.025,
            "cacheRead": 0.0025,
            "cacheWrite": null,
            "output": 0.2
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-5-pro": {
      "tiers": {
        "standard": {
          "short": {
            "input": 15,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 120
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 7.5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 60
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4.1": {
      "tiers": {
        "standard": {
          "short": {
            "input": 2,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 8
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 4
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 3.5,
            "cacheRead": 0.875,
            "cacheWrite": null,
            "output": 14
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4.1-mini": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.4,
            "cacheRead": 0.1,
            "cacheWrite": null,
            "output": 1.6
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.2,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 0.8
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 0.7,
            "cacheRead": 0.175,
            "cacheWrite": null,
            "output": 2.8
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4.1-nano": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.1,
            "cacheRead": 0.025,
            "cacheWrite": null,
            "output": 0.4
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.05,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 0.2
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 0.2,
            "cacheRead": 0.05,
            "cacheWrite": null,
            "output": 0.8
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4o": {
      "tiers": {
        "standard": {
          "short": {
            "input": 2.5,
            "cacheRead": 1.25,
            "cacheWrite": null,
            "output": 10
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1.25,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 4.25,
            "cacheRead": 2.125,
            "cacheWrite": null,
            "output": 17
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4o-2024-05-13": {
      "tiers": {
        "standard": {
          "short": {
            "input": 5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 15
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 2.5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 7.5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 8.75,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 26.25
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4o-mini": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.15,
            "cacheRead": 0.075,
            "cacheWrite": null,
            "output": 0.6
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.075,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 0.3
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 0.25,
            "cacheRead": 0.125,
            "cacheWrite": null,
            "output": 1
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "o1": {
      "tiers": {
        "standard": {
          "short": {
            "input": 15,
            "cacheRead": 7.5,
            "cacheWrite": null,
            "output": 60
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 7.5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 30
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "o1-pro": {
      "tiers": {
        "standard": {
          "short": {
            "input": 150,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 600
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 75,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 300
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "o3-pro": {
      "tiers": {
        "standard": {
          "short": {
            "input": 20,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 80
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 10,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 40
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "o3": {
      "tiers": {
        "standard": {
          "short": {
            "input": 2,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 8
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 4
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 1,
            "cacheRead": 0.25,
            "cacheWrite": null,
            "output": 4
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 3.5,
            "cacheRead": 0.875,
            "cacheWrite": null,
            "output": 14
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "o4-mini": {
      "tiers": {
        "standard": {
          "short": {
            "input": 1.1,
            "cacheRead": 0.275,
            "cacheWrite": null,
            "output": 4.4
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.55,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 2.2
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "flex": {
          "short": {
            "input": 0.55,
            "cacheRead": 0.138,
            "cacheWrite": null,
            "output": 2.2
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "fast": {
          "short": {
            "input": 2,
            "cacheRead": 0.5,
            "cacheWrite": null,
            "output": 8
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "o3-mini": {
      "tiers": {
        "standard": {
          "short": {
            "input": 1.1,
            "cacheRead": 0.55,
            "cacheWrite": null,
            "output": 4.4
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.55,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 2.2
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4-turbo-2024-04-09": {
      "tiers": {
        "standard": {
          "short": {
            "input": 10,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 30
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 15
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-4-0613": {
      "tiers": {
        "standard": {
          "short": {
            "input": 30,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 60
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 15,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 30
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-3.5-turbo": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 1.5
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-3.5-turbo-0125": {
      "tiers": {
        "standard": {
          "short": {
            "input": 0.5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 1.5
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 0.25,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 0.75
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-3.5-turbo-1106": {
      "tiers": {
        "standard": {
          "short": {
            "input": 1,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 2
          },
          "long": null,
          "inputTokensAbove": 272000
        },
        "batch": {
          "short": {
            "input": 1,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 2
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    },
    "gpt-3.5-turbo-instruct": {
      "tiers": {
        "standard": {
          "short": {
            "input": 1.5,
            "cacheRead": null,
            "cacheWrite": null,
            "output": 2
          },
          "long": null,
          "inputTokensAbove": 272000
        }
      }
    }
  }
};
